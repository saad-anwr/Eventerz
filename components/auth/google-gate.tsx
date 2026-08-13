"use client";

/**
 * The Google half of the access model - the web counterpart to the dApp's
 * `features/auth/google-gate.tsx`.
 *
 * # The model this enforces
 *
 * Two credentials, each unlocking a different half of the product:
 *
 *   * **Google** is the account: profile, social graph, recovery. Anything
 *     involving other people - friends, requests, messages - needs it. A
 *     keypair is free to mint by the thousand, which makes a wallet the wrong
 *     thing to hang a social graph off; a Google account has a real cost and a
 *     way back in when a device is lost.
 *   * **A wallet** is for the chain: RSVPs claim an on-chain seat and tickets
 *     are cNFTs, so those need a signer, and Google cannot substitute for a
 *     signature.
 *
 * Browsing needs neither, deliberately.
 *
 * Both platforms enforce this identically so that using the site on a phone and
 * using the app are the same product - a wallet-only visitor is stopped here and
 * nowhere else, on either one.
 */

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

/** True when the signed-in state satisfies the Google requirement. */
export function useHasGoogleAccount(): boolean {
  const { isLive, supabaseUser } = useAuth();
  // `isLive` is part of the test on purpose: with no Supabase project there is
  // no account to sign into, and prompting would offer a button that cannot work.
  return Boolean(isLive && supabaseUser);
}

/**
 * Google's mark, inline so the page stays self-contained (CSP-safe).
 *
 * Exported because the connect modal shows the same button; a second copy of
 * this path data is a second thing to keep in step for no benefit.
 */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

export function GoogleGate({
  title = "Sign in to see your community",
  description = "Friends, requests and messages live on your Google account - it is what makes your profile discoverable and recoverable. Your wallet stays connected and keeps handling tickets and RSVPs.",
}: {
  title?: string;
  description?: string;
}) {
  const { signInWithGoogle, loading } = useAuth();

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
      <span className="mx-auto mb-5 inline-flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
        <GoogleMark className="size-7" />
      </span>

      <h2 className="font-display text-xl font-bold text-white">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>

      <Button
        onClick={() => void signInWithGoogle()}
        disabled={loading}
        className="mt-7"
      >
        Continue with Google
      </Button>
    </div>
  );
}
