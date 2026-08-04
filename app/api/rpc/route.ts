/**
 * Solana RPC proxy.
 *
 *   POST /api/rpc     JSON-RPC 2.0, same shape as talking to Helius directly
 *
 * # Why this exists
 *
 * `NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so
 * a Helius URL shipped that way is extractable from any page with
 * `curl … | grep api-key`. That is not a bug in Next.js - it is what the prefix
 * means - and it is why the key that leaked on 31 Jul was recoverable from a
 * committed APK the same way.
 *
 * Restricting the key by domain in the Helius dashboard bounds the damage but
 * does not hide the value, and origin headers are set by the caller's browser,
 * not by us. The only arrangement where the key is genuinely not published is
 * one where the browser never sees it: the browser talks to this route, and
 * this route talks to Helius with a **server-only** `HELIUS_RPC_URL`.
 *
 * # What this is not
 *
 * A pass-through would be worse than the leak. `https://www.eventerz.xyz/api/rpc`
 * with no controls is a free, unmetered, unauthenticated RPC endpoint for the
 * whole internet, billed to us - strictly better for an abuser than the key,
 * because it needs no extraction and cannot be revoked without a deploy. So the
 * three controls below are not optional hardening; they are the reason this is
 * safe to expose at all.
 */

/*
 * Edge runtime: this is a fetch that forwards a fetch. Node's APIs buy nothing
 * here, and an RPC hot path is exactly where cold starts and distance from the
 * user are felt.
 */
export const runtime = 'edge';

/* Nothing here is cacheable - every call is a fresh chain read or a write. */
export const dynamic = 'force-dynamic';

/* -------------------------------------------------------------------------- */
/*  1. Method allowlist                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Every JSON-RPC method this app actually calls, and nothing else.
 *
 * Derived from the call sites rather than from a general-purpose list: the
 * first three groups are what `lib/solana/*` sends explicitly, and the rest are
 * what `@solana/web3.js` and the wallet adapter issue on our behalf when a
 * transaction is built, sent and confirmed.
 *
 * Anything absent is refused with a message naming the method, so a genuine
 * omission surfaces as a clear error in one place rather than as a mysterious
 * failure inside web3.js. Add deliberately - an allowlist that grows by reflex
 * is a denylist wearing a hat.
 */
const ALLOWED_METHODS = new Set([
  // holdings.ts
  'getBalance',
  'getTokenAccountsByOwner',
  'searchAssets', // Helius DAS

  // priority-fee.ts
  'getRecentPrioritizationFees',

  // use-onchain-actions.ts / use-fee.ts / send-crypto-dialog.tsx
  'getAccountInfo',
  'getLatestBlockhash',
  'sendTransaction',
  'simulateTransaction',

  // confirmation polling - see lib/solana/confirm.ts
  'getSignatureStatuses',
  'getBlockHeight',

  // read paths web3.js reaches for while building or inspecting a transaction
  'getMultipleAccounts',
  'getFeeForMessage',
  'getMinimumBalanceForRentExemption',
  'getSlot',
  'getTransaction',

  // diagnostics - scripts/check-mainnet.mjs and the health probe below
  'getHealth',
  'getVersion',
  'getGenesisHash',
]);

/* -------------------------------------------------------------------------- */
/*  2. Same-origin                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Only our own pages may use this endpoint.
 *
 * `Origin` is set by the browser and cannot be forged by page JavaScript, so
 * this genuinely stops another site pointing its wallet adapter at us. It does
 * **not** stop a script with no browser at all - `curl` simply omits the header
 * or sends whatever it likes - which is what the rate limit below is for.
 *
 * Two headers, because a same-origin `fetch` from a page does not always carry
 * `Origin`; `Referer` is the fallback, and a request with neither is refused.
 */
function isSameOrigin(request: Request): boolean {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  const self = new URL(request.url).origin;

  const allowed = new Set([self]);
  if (site) allowed.add(site);

  /*
   * Preview deployments get a generated hostname that no environment variable
   * knows in advance. `VERCEL_URL` is injected per-deployment and is the only
   * thing that does.
   */
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) allowed.add(`https://${vercelUrl}`);

  const origin = request.headers.get('origin');
  if (origin) return allowed.has(origin.replace(/\/$/, ''));

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/*  3. Rate limit                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort per-IP token bucket, held in module scope.
 *
 * Its limits are worth stating plainly rather than discovering later: edge
 * instances are ephemeral and there are many of them, so this counts per
 * instance, not globally. A determined abuser spreading requests across
 * instances gets more than `BURST`.
 *
 * It is still worth having. The realistic abuse here is a single script
 * hammering one endpoint, which this stops dead, and the alternative - a round
 * trip to Postgres per RPC call - would cost more latency than the proxy saves
 * in every legitimate case. If this ever needs to be exact, the answer is a
 * shared store (Vercel KV / Upstash), not a bigger map.
 */
const BURST = 60; // requests
const WINDOW_MS = 60_000; // per minute, per IP, per instance

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });

    /*
     * Evict while we are here. Without this the map is a slow memory leak for
     * the lifetime of the instance, keyed by every IP that ever called.
     */
    if (buckets.size > 5_000) {
      for (const [key, value] of buckets) {
        if (now > value.resetAt) buckets.delete(key);
      }
    }
    return false;
  }

  bucket.count += 1;
  return bucket.count > BURST;
}

/* -------------------------------------------------------------------------- */
/*  Upstream                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The real endpoint. **No `NEXT_PUBLIC_` prefix** - that is the entire point of
 * this file, and adding one would silently undo it.
 *
 * Unset falls back to the public cluster endpoint, which keeps a fresh clone
 * working with no configuration. It is rate-limited and unsuitable for
 * production traffic, which `lib/env.ts` warns about at build time.
 */
function upstream(): string {
  const configured = process.env.HELIUS_RPC_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) return configured;

  const cluster = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim().toLowerCase();
  if (cluster === 'devnet') return 'https://api.devnet.solana.com';
  if (cluster === 'testnet') return 'https://api.testnet.solana.com';
  return 'https://api.mainnet-beta.solana.com';
}

/** Bodies larger than this are not RPC calls we make. */
const MAX_BODY_BYTES = 100_000;

/** A batch is legitimate, but an unbounded one is a free amplifier. */
const MAX_BATCH = 10;

const rpcError = (id: unknown, code: number, message: string, status: number) =>
  Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status });

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return rpcError(null, -32600, 'This endpoint only serves eventerz.xyz.', 403);
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (rateLimited(ip)) {
    return rpcError(null, -32005, 'Too many requests. Slow down.', 429);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return rpcError(null, -32600, 'Request body too large.', 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return rpcError(null, -32700, 'Parse error.', 400);
  }

  const calls = Array.isArray(payload) ? payload : [payload];
  if (calls.length === 0 || calls.length > MAX_BATCH) {
    return rpcError(null, -32600, `Batch must hold 1-${MAX_BATCH} calls.`, 400);
  }

  for (const call of calls) {
    const method = (call as { method?: unknown })?.method;
    if (typeof method !== 'string' || !ALLOWED_METHODS.has(method)) {
      return rpcError(
        (call as { id?: unknown })?.id,
        -32601,
        `Method "${String(method)}" is not proxied. Add it to ALLOWED_METHODS in app/api/rpc/route.ts if the app genuinely needs it.`,
        400,
      );
    }
  }

  try {
    const response = await fetch(upstream(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
      signal: AbortSignal.timeout(20_000),
    });

    /*
     * Pass the upstream body through untouched, including its errors: a JSON-RPC
     * error is a valid answer that web3.js knows how to read, and rewriting it
     * here would turn a precise message into a generic one.
     *
     * The status is deliberately *not* passed through unchanged for 4xx/5xx from
     * the provider - those can carry provider-identifying detail - but the body
     * already says what went wrong in RPC terms.
     */
    const body = await response.text();
    return new Response(body, {
      status: response.ok ? 200 : 502,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return rpcError(
      null,
      -32603,
      timedOut ? 'The RPC provider timed out.' : 'The RPC provider is unreachable.',
      504,
    );
  }
}

/** A liveness probe that reveals nothing about the upstream or its key. */
export async function GET(): Promise<Response> {
  return Response.json({ ok: true, methods: ALLOWED_METHODS.size });
}
