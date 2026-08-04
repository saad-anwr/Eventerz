import 'server-only';

/**
 * Fail a production build that is missing something it cannot work without.
 *
 * # Why this is production-only
 *
 * The app is deliberately runnable from a fresh clone with no `.env` at all:
 * `isSupabaseConfigured` is false, auth falls back to the local demo store, and
 * the marketing site works. That is a real feature - it is how someone
 * evaluates the project - and a hard requirement at import time would delete it.
 *
 * So the rule is scoped to where it matters. In development, missing config
 * means "demo mode". In production it means a deployment that will build
 * cleanly, serve every page, and be unable to sign anybody in - the failure
 * shows up as users reporting that the site is broken, hours later, with
 * nothing in the logs to say why. Turning that into a failed build is the whole
 * point: a build that fails is a deploy that never happened.
 *
 * # What counts as critical
 *
 * Only values whose absence breaks the product for everyone. `MERKLE_TREE_ADDRESS`
 * and `EVENTERZ_PROGRAM_ID` are intentionally absent - every on-chain path
 * checks them and degrades cleanly, which is documented behaviour rather than a
 * broken deploy.
 *
 * `HELIUS_RPC_URL` is a warning rather than an error: without it `/api/rpc`
 * forwards to the public mainnet RPC, which genuinely works and is genuinely
 * unsuitable for production traffic. Failing the build over it would block a
 * deploy that is degraded, not broken.
 *
 * Note the **absent** `NEXT_PUBLIC_` prefix on that one. It is read only by
 * `app/api/rpc/route.ts`, server-side, precisely so the key is never inlined
 * into the client bundle. A `NEXT_PUBLIC_HELIUS_RPC_URL` left over from before
 * the proxy is not merely redundant - it republishes the key - so it is checked
 * for and complained about below.
 */

type Check = {
  name: string;
  value: string | undefined;
  why: string;
};

const REQUIRED: Check[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    value: process.env.NEXT_PUBLIC_SUPABASE_URL,
    why: 'Without it the site runs on the local demo store: nobody can sign in, and no event, RSVP or ticket is real.',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    why: 'Same as above - the client cannot reach the database without it.',
  },
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    value: process.env.NEXT_PUBLIC_SITE_URL,
    why: 'Used in the OAuth redirect and in every shared link. Wrong or missing sends users to a URL that does not resolve.',
  },
];

const RECOMMENDED: Check[] = [
  {
    name: 'HELIUS_RPC_URL',
    value: process.env.HELIUS_RPC_URL,
    why: '/api/rpc falls back to the public mainnet RPC, which is shared and aggressively rate-limited: balance reads start failing and transfers sit at "confirming".',
  },
  {
    name: 'NEXT_PUBLIC_SOLANA_NETWORK',
    value: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
    why: 'Defaults to mainnet-beta, which is almost certainly right - but "almost certainly" is a poor way to decide which chain real money moves on. Set it so the answer is recorded rather than inferred.',
  },
];

/**
 * Shout about a `NEXT_PUBLIC_` copy of the RPC URL.
 *
 * Next.js inlines anything with that prefix into the client bundle, so leaving
 * the old variable in place after moving to the proxy publishes the key to every
 * visitor - quietly, and while the dashboard looks tidier than before. Worth a
 * loud warning rather than a silent pass, because nothing else would ever
 * surface it.
 */
function warnOnPublishedKey(): void {
  if (!process.env.NEXT_PUBLIC_HELIUS_RPC_URL?.trim()) return;

  // eslint-disable-next-line no-console
  console.warn(
    '[env] NEXT_PUBLIC_HELIUS_RPC_URL is set. That prefix inlines the value ' +
      'into the client bundle, so the RPC key is published to every visitor. ' +
      'RPC now goes through /api/rpc - rename the variable to HELIUS_RPC_URL ' +
      '(no prefix) and redeploy.',
  );
}



function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  warnOnPublishedKey();

  const missing = REQUIRED.filter((c) => !c.value?.trim());

  for (const { name, why } of RECOMMENDED.filter((c) => !c.value?.trim())) {
    // eslint-disable-next-line no-console
    console.warn(`[env] ${name} is not set. ${why}`);
  }

  if (missing.length === 0) return;

  const detail = missing.map(({ name, why }) => `  - ${name}\n      ${why}`).join('\n');

  throw new Error(
    `\nMissing required environment variable${missing.length > 1 ? 's' : ''} for a production build:\n\n` +
      `${detail}\n\n` +
      `Set them in the Vercel project (Settings -> Environment Variables) and redeploy.\n` +
      `Names and shapes are documented in .env.example.\n`,
  );
}

// The module's only job. `app/layout.tsx` imports this file for the side
// effect - a bare `import "@/lib/env"` with no bindings, which no bundler
// drops.
assertProductionEnv();
