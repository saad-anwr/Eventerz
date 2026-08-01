/**
 * verify-payment - confirm an in-chat payment receipt against the cluster.
 *
 *   POST /functions/v1/verify-payment
 *   Authorization: Bearer <the user's Supabase JWT>
 *   { "signature": "..." }
 *
 * `record_payment` (migration 0009) writes receipts with `verified = false`,
 * because Postgres cannot make an outbound RPC call and therefore cannot know
 * whether the transaction the client described actually happened. Every client
 * renders an unverified receipt without a tick - an unchecked claim must not
 * look like a checked one - and this is what turns the tick on.
 *
 * The check is a balance delta, not an instruction walk. Reading the
 * instruction list means understanding every program that might have moved the
 * money: a plain transfer, a token program transfer, a router, a wallet's own
 * batching. The recipient's balance before and after is the same question
 * asked in a way that has one answer regardless of how the money got there.
 *
 * Idempotent, and safe to call from either party - the transaction is already
 * public, so letting the recipient trigger the check leaks nothing and means
 * a receipt still gets verified when the sender's app is closed.
 */

import { json, logError, preflight, requireUser, serviceClient, rateLimit } from '../_shared/http.ts';

interface PaymentRow {
  signature: string;
  cluster: string;
  from_profile: string;
  to_profile: string | null;
  from_wallet: string;
  to_wallet: string;
  amount: number;
  mint: string | null;
  verified: boolean;
}

function rpcUrl(cluster: string): string {
  const helius = Deno.env.get('HELIUS_RPC_URL');
  if (helius) return helius;
  if (cluster === 'mainnet-beta') return 'https://api.mainnet-beta.solana.com';
  return `https://api.${cluster}.solana.com`;
}

async function getTransaction(cluster: string, signature: string) {
  const response = await fetch(rpcUrl(cluster), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [
        signature,
        {
          encoding: 'jsonParsed',
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC returned ${response.status}`);
  }
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message ?? 'RPC error');
  return payload.result;
}

/**
 * Lamports the address gained in this transaction.
 *
 * Uses the account index from the message key list - the same ordering
 * `preBalances` and `postBalances` are indexed by. Versioned transactions with
 * address-lookup tables put the extra keys in `meta.loadedAddresses`, which the
 * balance arrays cover in the order writable-then-readonly, so those are
 * appended in that order rather than ignored.
 */
function nativeDelta(tx: any, address: string): number | null {
  const keys: string[] = (tx.transaction?.message?.accountKeys ?? []).map(
    (k: any) => (typeof k === 'string' ? k : k.pubkey),
  );
  const loaded = tx.meta?.loadedAddresses;
  if (loaded) {
    keys.push(...(loaded.writable ?? []), ...(loaded.readonly ?? []));
  }

  const index = keys.indexOf(address);
  if (index < 0) return null;

  const pre = tx.meta?.preBalances?.[index];
  const post = tx.meta?.postBalances?.[index];
  if (typeof pre !== 'number' || typeof post !== 'number') return null;
  return post - pre;
}

/** Base units of `mint` the address gained, across all its token accounts. */
function tokenDelta(tx: any, address: string, mint: string): number | null {
  const sum = (entries: any[]) =>
    entries
      .filter((b) => b.owner === address && b.mint === mint)
      .reduce((total, b) => total + Number(b.uiTokenAmount?.amount ?? 0), 0);

  const pre = tx.meta?.preTokenBalances;
  const post = tx.meta?.postTokenBalances;
  if (!Array.isArray(pre) || !Array.isArray(post)) return null;
  return sum(post) - sum(pre);
}

Deno.serve(async (request: Request) => {
  const options = preflight(request);
  if (options) return options;

  if (request.method !== 'POST') {
    return json(request, { error: 'Use POST.' }, 405);
  }

  const user = await requireUser(request);
  if (!user) return json(request, { error: 'Sign in first.' }, 401);

  /*
   * Each call is an outbound RPC to a provider billed per request, so this bounds
   * spend as much as abuse. Twenty a minute leaves ample room for a client
   * retrying a confirmation.
   *
   * Keyed on the profile id, not the address: a caller can open a new
   * connection but cannot become a different account.
   */
  const limited = await rateLimit(request, 'verify-payment', user.id, 20, 60);
  if (limited) return limited;

  let body: { signature?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'Expected a JSON body.' }, 400);
  }

  const signature = (body.signature ?? '').trim();
  if (!signature) return json(request, { error: 'signature is required.' }, 400);

  const supabase = serviceClient();

  const { data: payment, error: lookupError } = await supabase
    .from('payments')
    .select('*')
    .eq('signature', signature)
    .maybeSingle<PaymentRow>();

  if (lookupError) {
    logError('[verify-payment] lookup failed', lookupError);
    return json(request, { error: 'Could not read that receipt.' }, 500);
  }
  if (!payment) {
    return json(request, { error: 'No receipt with that signature.' }, 404);
  }

  /*
   * Only the two parties may ask. The service-role client above bypasses RLS,
   * so the policy on `payments` does not apply here and this check has to be
   * made explicitly - a service-role query with no authorisation of its own is
   * the standard way an Edge Function turns a private table into a public one.
   */
  if (payment.from_profile !== user.id && payment.to_profile !== user.id) {
    return json(request, { error: 'That receipt is not yours.' }, 403);
  }

  if (payment.verified) {
    return json(request, { verified: true, alreadyVerified: true });
  }

  let tx: any;
  try {
    tx = await getTransaction(payment.cluster, signature);
  } catch (error) {
    logError('[verify-payment] rpc failed', error);
    return json(
      request,
      { error: 'Could not reach the network to check that transaction.' },
      502,
    );
  }

  if (!tx) {
    // Not an error: a transaction submitted seconds ago may not have propagated
    // to this RPC yet, and the caller should retry rather than conclude a lie.
    return json(request, {
      verified: false,
      reason: 'not-found',
      detail: 'That transaction has not landed yet. Try again in a moment.',
    });
  }

  if (tx.meta?.err) {
    return json(request, {
      verified: false,
      reason: 'failed',
      detail: 'That transaction failed on-chain.',
    });
  }

  const received = payment.mint
    ? tokenDelta(tx, payment.to_wallet, payment.mint)
    : nativeDelta(tx, payment.to_wallet);

  if (received === null) {
    return json(request, {
      verified: false,
      reason: 'recipient-absent',
      detail: 'That transaction does not touch the recipient wallet.',
    });
  }

  /*
   * `>=` rather than `===`. The recipient may legitimately have gained more in
   * the same transaction - a wallet batching two transfers, or rent returned
   * from a closed account. What matters is that at least the recorded amount
   * arrived; a receipt claiming *less* than actually moved is not a lie worth
   * blocking.
   */
  if (received < payment.amount) {
    return json(request, {
      verified: false,
      reason: 'amount-mismatch',
      detail: `That transaction moved ${received}, not ${payment.amount}.`,
    });
  }

  const { error: markError } = await supabase.rpc('mark_payment_verified', {
    p_signature: signature,
  });
  if (markError) {
    logError('[verify-payment] mark failed', markError);
    return json(request, { error: 'Could not save the result.' }, 500);
  }

  return json(request, { verified: true });
});
