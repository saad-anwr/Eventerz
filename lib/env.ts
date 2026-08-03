import 'server-only';

import { createHash } from 'node:crypto';

/**
 * Fail a production build that is missing something it cannot work without,
 * or that still carries a credential known to be public.
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
 *
 * Being *set to the key that leaked* is the opposite case, and does fail the
 * build. A deploy that ships a publicly-known billable credential is worse than
 * no deploy: it is someone else's spend, and every hour it runs is another hour
 * of it. See the rotation section in the root README.
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

/**
 * SHA-256 of the Helius key that was published to a public repository on
 * 31 Jul 2026 and stayed readable for ~17 hours.
 *
 * The hash rather than the key: this file is committed, and committing the
 * value again is the whole mistake. A 128-bit key behind SHA-256 is not
 * recoverable from this, but an exact match is detectable - which is all the
 * check needs. `Eventerz dApp/scripts/check-mainnet.mjs` carries the same
 * constant for the same reason.
 *
 * Delete this and `assertKeyRotated` once rotation is done and confirmed.
 */
const COMPROMISED_RPC_KEY_SHA256 =
  '03d54d4cbe0375f08a0866088591a593c936648c9f419b721b46f27d23ea94e8';

function assertKeyRotated(): void {
  const key = (process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? '').match(
    /api[-_]?key=([^&\s]+)/i,
  )?.[1];
  if (!key) return;

  const digest = createHash('sha256').update(key).digest('hex');
  if (digest !== COMPROMISED_RPC_KEY_SHA256) return;

  /*
   * Deliberate override, for the case where a deploy genuinely cannot wait for
   * the Helius dashboard. It is an env var rather than a code edit so that
   * choosing it leaves a trace in the Vercel project rather than in a diff
   * nobody reads - and so that removing it is one click.
   */
  if (process.env.ALLOW_COMPROMISED_RPC_KEY === '1') {
    // eslint-disable-next-line no-console
    console.warn(
      '[env] Shipping the Helius key that leaked on 31 Jul 2026. ' +
        'ALLOW_COMPROMISED_RPC_KEY=1 is set. Rotate and unset it.',
    );
    return;
  }

  throw new Error(
    '\nNEXT_PUBLIC_HELIUS_RPC_URL still carries the Helius key that was published\n' +
      'to a public repository on 31 Jul 2026. Assume it was scraped - public\n' +
      'repositories are harvested for keys continuously.\n\n' +
      '  1. Revoke it in the Helius dashboard and issue a new one.\n' +
      '  2. Update NEXT_PUBLIC_HELIUS_RPC_URL in the Vercel project, .env.local,\n' +
      '     and the dApp\'s EAS environment variables.\n' +
      '  3. Set a spend cap and a domain restriction on the new key. A key in a\n' +
      '     client bundle is extractable by design, so the cap is its real\n' +
      '     protection - rotation fixes this leak, the cap survives the next.\n\n' +
      'If a deploy truly cannot wait, set ALLOW_COMPROMISED_RPC_KEY=1 - and treat\n' +
      'that as a countdown, not a resolution.\n',
  );
}

function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  assertKeyRotated();

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
