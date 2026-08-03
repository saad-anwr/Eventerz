"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

import { Background } from "@/components/layout/background";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * There was none, which meant any thrown render error took the whole route to
 * Next's default error screen - white, unstyled, and in production carrying no
 * information at all. The user's only move was the browser back button.
 *
 * `reset()` re-renders the segment without a full reload, so a transient
 * failure (an RPC timeout, a query that raced a sign-out) costs one tap rather
 * than a page load and a lost scroll position.
 *
 * No `<Navbar>` here on purpose: the navbar reads auth context, and if the
 * error came from that context it would throw again inside its own error
 * boundary. The exits are plain links for the same reason.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Nothing forwards this to an error reporter yet. Logging it at least puts
    // it somewhere a developer looking at a user's console can find it.
    // eslint-disable-next-line no-console
    console.error("[eventerz] route error", error);
  }, [error]);

  return (
    <>
      <Background />
      <main className="relative">
        <div className="container flex min-h-screen max-w-xl flex-col items-center justify-center py-24 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
            <AlertTriangle className="size-6" />
          </div>

          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-white">
            Something broke
          </h1>
          <p className="mt-4 text-balance text-muted-foreground">
            This is our fault, not yours. Trying again usually works - the
            problem is often a request that timed out rather than anything
            permanent.
          </p>

          {/*
            The digest is the only handle on a production error: the message is
            stripped from the client bundle, and this is what ties a user's
            report to a server log.
          */}
          {error.digest && (
            <p className="mt-4 font-mono text-xs text-muted-foreground/70">
              Reference {error.digest}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button onClick={reset}>
              <RotateCcw className="size-4" />
              Try again
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">
                <Home className="size-4" />
                Go home
              </Link>
            </Button>
          </div>

          <p className="mt-8 text-xs text-muted-foreground">
            Still stuck?{" "}
            <a
              href="mailto:eventerz.web@gmail.com"
              className="text-brand-cyan underline underline-offset-2 hover:text-white"
            >
              Tell us what happened
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
