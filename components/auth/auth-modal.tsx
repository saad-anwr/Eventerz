"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Mail, ShieldCheck, Wallet, X } from "lucide-react";
import { useAuth } from "./auth-provider";
import { useConnectModal } from "@/components/wallet/connect-modal-context";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { EventerzMark } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

/**
 * Names used only by the offline demo path, when no Supabase project is
 * configured. With Supabase wired up, Google returns the person's real name.
 */
const DEMO_NAMES = [
  "Alex Rivera",
  "Jordan Lee",
  "Sam Carter",
  "Riya Kapoor",
  "Noah Kim",
  "Zoe Chen",
  "Omar Farah",
  "Ivy Nguyen",
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.56Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.1 0 5.7-1.03 7.6-2.79l-3.72-2.88c-1.03.69-2.35 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.76v2.97A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.71a7.2 7.2 0 0 1 0-4.42V7.32H1.76a12 12 0 0 0 0 10.36l3.84-2.97Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.68 0 3.19.58 4.38 1.72l3.28-3.28C17.7 1.2 15.1 0 12 0A11.99 11.99 0 0 0 1.76 7.32L5.6 10.3C6.5 7.58 9.02 4.75 12 4.75Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-white" aria-hidden>
      <path d="M17.05 12.54c-.03-2.6 2.13-3.85 2.22-3.91-1.21-1.77-3.09-2.02-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.28-1.27 3.14-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.75-4.13-.02-.01 0 0 0 0ZM14.6 4.9c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44Z" />
    </svg>
  );
}

export function AuthModal() {
  const {
    authOpen,
    closeAuth,
    signIn,
    signInWithGoogle,
    signInWithEmail,
    isLive,
  } = useAuth();
  const { open: openWalletModal } = useConnectModal();
  useScrollLock(authOpen);

  const [busy, setBusy] = React.useState<null | "google" | "apple" | "email">(
    null
  );
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  /** Set once a magic link has been mailed, so we can confirm it. */
  const [sentTo, setSentTo] = React.useState("");

  // Reset transient state when closing.
  React.useEffect(() => {
    if (!authOpen) {
      setBusy(null);
      setError("");
      setSentTo("");
    }
  }, [authOpen]);

  React.useEffect(() => {
    if (!authOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAuth();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authOpen, closeAuth]);

  const social = async (method: "google" | "apple") => {
    setBusy(method);
    setError("");

    // Real Google OAuth once a Supabase project is configured. On success the
    // browser navigates to Google, so nothing after this resolves.
    if (method === "google" && isLive) {
      const result = await signInWithGoogle();
      if (!result.ok) {
        setError(result.error ?? "Could not start Google sign-in.");
        setBusy(null);
      }
      return;
    }

    if (method === "apple" && isLive) {
      setError(
        "Apple sign-in is not enabled yet. Use Google or connect a wallet."
      );
      setBusy(null);
      return;
    }

    // Offline demo path - no backend configured.
    window.setTimeout(() => {
      const rnd = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
      const handle = rnd.toLowerCase().replace(/\s+/g, ".");
      const domain = method === "google" ? "gmail.com" : "icloud.com";
      signIn(method, { name: rnd, email: `${handle}@${domain}` });
    }, 850);
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy("email");
    setError("");

    // Live: Supabase mails a one-time link. No password is ever stored.
    if (isLive) {
      const result = await signInWithEmail(value);
      setBusy(null);
      if (result.ok) setSentTo(value);
      else setError(result.error ?? "Could not send the sign-in link.");
      return;
    }

    window.setTimeout(() => {
      signIn("email", { name: name.trim(), email: value });
    }, 500);
  };

  const goWallet = () => {
    closeAuth();
    openWalletModal();
  };

  return (
    <AnimatePresence>
      {authOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Sign in to Eventerz"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={closeAuth}
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="gradient-border relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-brand-bg-soft/95 shadow-card backdrop-blur-2xl"
          >
            <button
              onClick={closeAuth}
              aria-label="Close"
              className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-8 text-center">
              <EventerzMark className="mx-auto size-12" />
              <h2 className="mt-4 font-display text-xl font-bold text-white">
                {sentTo ? "Check your inbox" : "Sign in to Eventerz"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {sentTo
                  ? `We sent a one-time sign-in link to ${sentTo}.`
                  : "Your wallet is your identity - Google keeps it recoverable."}
              </p>
            </div>

            {sentTo ? (
              <div className="px-6 pb-2">
                <button
                  onClick={() => {
                    setSentTo("");
                    setEmail("");
                  }}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
                >
                  Use a different email
                </button>
              </div>
            ) : (
            <div className="space-y-2.5 px-6">
              {/* Social */}
              <button
                onClick={() => social("google")}
                disabled={!!busy}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white transition-colors hover:bg-white/[0.08] disabled:opacity-60"
              >
                {busy === "google" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </button>
              <button
                onClick={() => social("apple")}
                disabled={!!busy}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white transition-colors hover:bg-white/[0.08] disabled:opacity-60"
              >
                {busy === "apple" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <AppleIcon />
                )}
                Continue with Apple
              </button>

              {/* Email */}
              <form onSubmit={submitEmail} className="space-y-2.5 pt-1">
                {/*
                  Live, the display name comes from the provider or the profile
                  editor - asking for it here would be a field we then ignore.
                */}
                {!isLive && (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name (optional)"
                    autoComplete="name"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none"
                  />
                )}
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none"
                  />
                </div>
                {error && <p className="px-1 text-xs text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={!!busy}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.01] disabled:opacity-60"
                >
                  {busy === "email" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      {isLive ? "Email me a sign-in link" : "Continue with Email"}
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              {/* Wallet */}
              <button
                onClick={goWallet}
                disabled={!!busy}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-brand-purple/30 bg-brand-purple/10 text-sm font-semibold text-white transition-colors hover:bg-brand-purple/15 disabled:opacity-60"
              >
                <Wallet className="size-4 text-brand-purple" />
                Connect a wallet
              </button>
            </div>
            )}

            <div className="flex shrink-0 items-start gap-2 border-t border-white/10 px-6 py-3.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-green" />
              <span>
                {isLive ? (
                  <>
                    Your wallet stays the primary identity - Google and email
                    only make the account recoverable. By continuing you agree to
                    our Terms &amp; Privacy Policy.
                  </>
                ) : (
                  <>
                    Demo mode - social sign-in is simulated. Configure Supabase to
                    enable real accounts (see docs/AUTH_SETUP.md).
                  </>
                )}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
