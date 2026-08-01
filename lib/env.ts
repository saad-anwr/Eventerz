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
 * `NEXT_PUBLIC_HELIUS_RPC_URL` is a warning rather than an error: without it the
 * app falls back to the public mainnet RPC, which genuinely works and is
 * genuinely unsuitable for production traffic. Failing the build over it would
 * block a deploy that is degraded, not broken.
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
    name: 'NEXT_PUBLIC_HELIUS_RPC_URL',
    value: process.env.NEXT_PUBLIC_HELIUS_RPC_URL,
    why: 'Falls back to the public mainnet RPC, which is shared and aggressively rate-limited: balance reads start failing and transfers sit at "confirming".',
  },
];

function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

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

assertProductionEnv();

/**
 * Imported for the side effect above. Exported so the import cannot be dropped
 * as unused by a bundler or a well-meaning lint autofix.
 */
export const envChecked = true;
