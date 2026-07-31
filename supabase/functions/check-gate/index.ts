/**
 * check-gate - verify a token holding, then grant the seat.
 *
 *   POST /functions/v1/check-gate
 *   Authorization: Bearer <the user's Supabase JWT>
 *   { "eventId": "..." }
 *
 * `request_to_join` (migration 0013) refuses token-gated events outright.
 * Postgres makes no outbound RPC calls, so it cannot read a balance, and an
 * entry point that cannot check the requirement must not be the one that admits
 * people. This is the only door into a gated event, and it reads the holding
 * from the cluster before opening it.
 *
 * Why the balance and not a signature: a "prove you hold X" challenge only
 * proves the wallet signed something. Holdings move. The question the host is
 * asking is whether this wallet holds the token *now*, and the only source for
 * that is the chain at request time.
 *
 * The wallet is read from the profile rather than the request body, and it got
 * there through 0011's Ed25519 flow - so it is a wallet this user proved they
 * hold, not one they named. Trusting a body field here would make the gate
 * checkable by anyone who can read a whale's address off the explorer.
 */

import { json, preflight, requireUser, serviceClient } from '../_shared/http.ts';

interface GateRow {
  id: string;
  token_gated: boolean;
  gate_mint: string | null;
  gate_min_amount: string | null;
  gate_symbol: string | null;
  gate_decimals: number | null;
  cancelled_at: string | null;
}

function rpcUrl(): string {
  const helius = Deno.env.get('HELIUS_RPC_URL');
  if (helius) return helius;
  const cluster = Deno.env.get('SOLANA_CLUSTER') ?? 'mainnet-beta';
  if (cluster === 'mainnet-beta') return 'https://api.mainnet-beta.solana.com';
  return `https://api.${cluster}.solana.com`;
}

async function rpc(method: string, params: unknown[]): Promise<any> {
  const response = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC returned ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message ?? 'RPC error');
  return payload.result;
}

/**
 * Base units of `mint` held by `owner`, summed across every token account.
 *
 * Summed rather than "the" account because a wallet can hold the same mint in
 * several accounts - an associated account plus anything an airdrop or a
 * program created. Reading only the ATA under-reports a real holding and
 * rejects someone who qualifies.
 *
 * Returned as a string and compared as BigInt: an SPL supply with 9 decimals
 * passes 2^53 well before it passes 2^63, and `Number` silently rounds there.
 */
async function tokenBalance(owner: string, mint: string): Promise<bigint> {
  const result = await rpc('getTokenAccountsByOwner', [
    owner,
    { mint },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]);

  const accounts: any[] = result?.value ?? [];
  return accounts.reduce((total: bigint, account: any) => {
    const raw = account?.account?.data?.parsed?.info?.tokenAmount?.amount;
    return total + (raw ? BigInt(raw) : 0n);
  }, 0n);
}

async function nativeBalance(owner: string): Promise<bigint> {
  const result = await rpc('getBalance', [owner, { commitment: 'confirmed' }]);
  const lamports = result?.value;
  return typeof lamports === 'number' ? BigInt(lamports) : 0n;
}

/** "1.5 BONK" from raw base units, for a message a human can act on. */
function display(raw: bigint, decimals: number | null, symbol: string | null): string {
  const unit = symbol ?? 'token';
  if (!decimals) return `${raw} ${unit}`;
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction} ${unit}` : `${whole} ${unit}`;
}

Deno.serve(async (request: Request) => {
  const options = preflight(request);
  if (options) return options;

  if (request.method !== 'POST') {
    return json(request, { error: 'Use POST.' }, 405);
  }

  const user = await requireUser(request);
  if (!user) return json(request, { error: 'Sign in first.' }, 401);

  let body: { eventId?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'Expected a JSON body.' }, 400);
  }

  const eventId = (body.eventId ?? '').trim();
  if (!eventId) return json(request, { error: 'eventId is required.' }, 400);

  const supabase = serviceClient();

  const { data: event, error: lookupError } = await supabase
    .from('events')
    .select('id, token_gated, gate_mint, gate_min_amount, gate_symbol, gate_decimals, cancelled_at')
    .eq('id', eventId)
    .maybeSingle<GateRow>();

  if (lookupError) {
    console.error('[check-gate] lookup failed', lookupError);
    return json(request, { error: 'Could not read that event.' }, 500);
  }
  if (!event) return json(request, { error: 'Event not found.' }, 404);

  /*
   * An ungated event still joins here rather than erroring. The client would
   * otherwise have to know which door to use before it knows the event is
   * gated, and a race - the host turns gating off mid-request - would surface
   * as a failure the guest cannot act on.
   */
  if (!event.token_gated || !event.gate_mint || !event.gate_min_amount) {
    const { data, error } = await supabase.rpc('request_to_join_verified', {
      p_event_id: eventId,
      p_profile_id: user.id,
    });
    if (error) return json(request, { error: error.message }, 400);
    return json(request, { joined: true, gated: false, rsvp: data });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('wallet_address')
    .eq('id', user.id)
    .maybeSingle<{ wallet_address: string | null }>();

  if (profileError) {
    console.error('[check-gate] profile lookup failed', profileError);
    return json(request, { error: 'Could not read your profile.' }, 500);
  }

  const wallet = profile?.wallet_address;
  if (!wallet) {
    return json(
      request,
      {
        joined: false,
        reason: 'no-wallet',
        detail: 'Link a wallet to join this event - its entry requirement is a token holding.',
      },
      403,
    );
  }

  const required = BigInt(event.gate_min_amount);

  let held: bigint;
  try {
    held = event.gate_mint === 'native'
      ? await nativeBalance(wallet)
      : await tokenBalance(wallet, event.gate_mint);
  } catch (error) {
    console.error('[check-gate] rpc failed', error);
    // 502, not 403. Failing to reach the cluster is our problem, and telling a
    // qualifying holder they do not qualify is the one wrong answer here.
    return json(
      request,
      { error: 'Could not reach the network to check your holdings. Try again.' },
      502,
    );
  }

  if (held < required) {
    return json(
      request,
      {
        joined: false,
        reason: 'insufficient',
        required: event.gate_min_amount,
        held: held.toString(),
        detail: `This event needs ${display(required, event.gate_decimals, event.gate_symbol)}. That wallet holds ${display(held, event.gate_decimals, event.gate_symbol)}.`,
      },
      403,
    );
  }

  const { data, error } = await supabase.rpc('request_to_join_verified', {
    p_event_id: eventId,
    p_profile_id: user.id,
  });
  if (error) return json(request, { error: error.message }, 400);

  return json(request, { joined: true, gated: true, rsvp: data });
});
