/**
 * claim-event - attach a host's on-chain record of authorship to their event.
 *
 *   POST /functions/v1/claim-event
 *   Authorization: Bearer <the user's Supabase JWT>
 *   { "eventId": "...", "signature": "...", "cluster": "mainnet-beta" }
 *
 * # Why this is not a column the client can write
 *
 * `events.onchain_signature` is deliberately absent from the INSERT grant in
 * migration 0017. A signature supplied by a client is a string, not a proof:
 * nothing stops someone pasting another event's signature, another wallet's
 * signature, or a plausible-looking 88 characters of base58. Stored unchecked,
 * the column would mean "some client once claimed this", which is worth less
 * than an empty column because it looks like more.
 *
 * So the check happens here, against the cluster, exactly as `verify-payment`
 * checks a receipt. Postgres cannot make an outbound RPC call, which is the
 * whole reason both of these live in a function runtime rather than in SQL.
 *
 * # What is actually verified
 *
 * Three things, all of which must hold:
 *
 *   1. The caller owns the event. Taken from the JWT, never the body.
 *   2. The transaction succeeded, and one of its **signers** is a wallet
 *      already proven to belong to this host (`wallet_links`). This is what
 *      makes the claim theirs - the link itself was established by an Ed25519
 *      challenge in `link-wallet`, so there is no path to a linked wallet the
 *      holder did not prove.
 *   3. A memo instruction in that transaction names this event id.
 *
 * Any one of these missing makes the signature someone else's, or about
 * something else. Two of the three is not a partial pass.
 *
 * Idempotent: re-submitting the signature already stored is a success, not a
 * conflict. A client that retried a flaky network should not be told off for it.
 */

import {
  json,
  logError,
  preflight,
  rateLimit,
  requireUser,
  serviceClient,
} from '../_shared/http.ts';

/** Marks a memo as ours. Kept in step with `services/solana/event-claim.ts`. */
const CLAIM_MEMO_PREFIX = 'eventerz:event-claim';

/** SPL Memo v2 - the only program whose instruction data we read here. */
const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

/**
 * Clusters we will ask about.
 *
 * An allowlist rather than interpolating the body into a hostname: `cluster` is
 * caller-supplied, and `rpcUrl` builds a URL out of it. Left open, that is an
 * outbound request to any host the caller names, signed with our egress - the
 * server-side request forgery that turns a verification endpoint into a proxy.
 */
const CLUSTERS = new Set(['mainnet-beta', 'devnet', 'testnet']);

function rpcUrl(cluster: string): string {
  const helius = Deno.env.get('HELIUS_RPC_URL');
  // Only for mainnet: the Helius URL is a mainnet endpoint, and using it to
  // look up a devnet signature returns "not found" rather than an error, which
  // reads as "the host is lying" instead of "wrong network".
  if (helius && cluster === 'mainnet-beta') return helius;
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

  if (!response.ok) throw new Error(`RPC returned ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message ?? 'RPC error');
  return payload.result;
}

/**
 * Addresses that signed this transaction.
 *
 * `jsonParsed` marks each account key with `signer`, so this reads the flag
 * rather than assuming the fee payer is the only one. A claim is signed by the
 * host's wallet, which is usually also the fee payer - but "usually" is not a
 * check, and a wallet that pays for a user's transaction is a normal thing for
 * a wallet to do.
 */
function signerAddresses(tx: any): string[] {
  const keys = tx?.transaction?.message?.accountKeys ?? [];
  return keys
    .filter((k: any) => typeof k === 'object' && k.signer)
    .map((k: any) => k.pubkey as string)
    .filter(Boolean);
}

/**
 * Every memo string in this transaction, inner instructions included.
 *
 * Inner instructions matter because a wallet is free to wrap what it submits -
 * batching, a smart-wallet program, a relayer. The memo is then a CPI rather
 * than a top-level instruction, and reading only the outer list would report
 * "no memo" for a transaction that plainly contains one.
 */
function memoTexts(tx: any): string[] {
  const outer = tx?.transaction?.message?.instructions ?? [];
  const inner = (tx?.meta?.innerInstructions ?? []).flatMap(
    (group: any) => group?.instructions ?? [],
  );

  const texts: string[] = [];
  for (const instruction of [...outer, ...inner]) {
    if (instruction?.programId !== MEMO_PROGRAM_ID) continue;

    /*
     * `jsonParsed` hands a memo back in one of two shapes depending on the RPC
     * and the memo version: `parsed` as a plain string, or raw base58 `data`.
     * Both are handled - falling back to only one of them makes verification
     * depend on which provider answered, which is the kind of bug that passes
     * every test and fails against one endpoint in production.
     */
    if (typeof instruction.parsed === 'string') {
      texts.push(instruction.parsed);
    } else if (typeof instruction.parsed?.info === 'string') {
      texts.push(instruction.parsed.info);
    } else if (typeof instruction.data === 'string') {
      try {
        texts.push(decodeBase58Utf8(instruction.data));
      } catch {
        // Undecodable data is not a memo we can read. Skipping it is right:
        // the claim then fails to verify, which is the safe direction.
      }
    }
  }
  return texts;
}

/** base58 -> UTF-8, for the raw-`data` shape above. */
function decodeBase58Utf8(value: string): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes: number[] = [];

  for (const char of value) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('not base58');

    let carry = index;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Leading '1's are leading zero bytes, and the loop above builds the number
  // little-endian - so restore them, then reverse.
  for (const char of value) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return new TextDecoder().decode(new Uint8Array(bytes.reverse()));
}

/** Does this memo claim this event? Both halves required - see `event-claim.ts`. */
function claimsEvent(memo: string, eventId: string): boolean {
  const text = memo.toLowerCase();
  return text.includes(CLAIM_MEMO_PREFIX) && text.includes(eventId.toLowerCase());
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
   * Each call is an outbound RPC to a provider billed per request, so this
   * bounds spend as much as abuse. Keyed on the profile id: a caller can open a
   * new connection but cannot become a different account.
   */
  const limited = await rateLimit(request, 'claim-event', user.id, 20, 60);
  if (limited) return limited;

  let body: { eventId?: string; signature?: string; cluster?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'Expected a JSON body.' }, 400);
  }

  const eventId = (body.eventId ?? '').trim();
  const signature = (body.signature ?? '').trim();
  const cluster = (body.cluster ?? 'mainnet-beta').trim();

  if (!eventId) return json(request, { error: 'eventId is required.' }, 400);
  if (!signature) return json(request, { error: 'signature is required.' }, 400);
  if (!CLUSTERS.has(cluster)) {
    return json(request, { error: 'Unknown cluster.' }, 400);
  }

  const supabase = serviceClient();

  const { data: event, error: lookupError } = await supabase
    .from('events')
    .select('id, host_id, onchain_signature')
    .eq('id', eventId)
    .maybeSingle<{
      id: string;
      host_id: string;
      onchain_signature: string | null;
    }>();

  if (lookupError) {
    logError('[claim-event] lookup failed', lookupError);
    return json(request, { error: 'Could not read that event.' }, 500);
  }
  if (!event) return json(request, { error: 'No event with that id.' }, 404);

  /*
   * Only the host may claim. The service-role client above bypasses RLS, so the
   * policy on `events` does not apply here and this check has to be made
   * explicitly - a service-role query with no authorisation of its own is the
   * standard way an Edge Function turns a private table into a public one.
   */
  if (event.host_id !== user.id) {
    return json(request, { error: 'That event is not yours.' }, 403);
  }

  // Idempotent. A client retrying after a flaky response resent the same
  // signature; that is a success it already earned, not a conflict.
  if (event.onchain_signature) {
    return json(request, {
      claimed: true,
      alreadyClaimed: true,
      signature: event.onchain_signature,
    });
  }

  const { data: links, error: linksError } = await supabase
    .from('wallet_links')
    .select('address')
    .eq('profile_id', user.id);

  if (linksError) {
    logError('[claim-event] wallet lookup failed', linksError);
    return json(request, { error: 'Could not read your wallets.' }, 500);
  }

  const owned = new Set(
    (links ?? []).map((l: { address: string }) => l.address.trim()),
  );
  if (owned.size === 0) {
    return json(request, {
      claimed: false,
      reason: 'no-linked-wallet',
      detail: 'Link a wallet to your account before claiming an event.',
    });
  }

  let tx: any;
  try {
    tx = await getTransaction(cluster, signature);
  } catch (error) {
    logError('[claim-event] rpc failed', error);
    return json(
      request,
      { error: 'Could not reach the network to check that transaction.' },
      502,
    );
  }

  if (!tx) {
    // Not an error: a transaction submitted seconds ago may not have reached
    // this RPC yet, and the caller should retry rather than conclude a lie.
    return json(request, {
      claimed: false,
      reason: 'not-found',
      detail: 'That transaction has not landed yet. Try again in a moment.',
    });
  }

  if (tx.meta?.err) {
    return json(request, {
      claimed: false,
      reason: 'failed',
      detail: 'That transaction failed on-chain.',
    });
  }

  const signedByHost = signerAddresses(tx).some((address) =>
    owned.has(address),
  );
  if (!signedByHost) {
    return json(request, {
      claimed: false,
      reason: 'wrong-signer',
      detail: 'That transaction was not signed by a wallet linked to your account.',
    });
  }

  if (!memoTexts(tx).some((memo) => claimsEvent(memo, eventId))) {
    return json(request, {
      claimed: false,
      reason: 'memo-mismatch',
      detail: 'That transaction does not carry a claim for this event.',
    });
  }

  /*
   * Written with the service client, which is the only thing that can: there is
   * no INSERT or UPDATE grant on this column for `authenticated`, by design.
   *
   * The `is` null guard makes the write itself idempotent under a race - two
   * clients claiming at once cannot overwrite each other, and the first
   * signature to verify is the one that stands.
   */
  const { error: writeError } = await supabase
    .from('events')
    .update({ onchain_signature: signature })
    .eq('id', eventId)
    .is('onchain_signature', null);

  if (writeError) {
    logError('[claim-event] write failed', writeError);
    return json(request, { error: 'Could not save the claim.' }, 500);
  }

  return json(request, { claimed: true, signature });
});
