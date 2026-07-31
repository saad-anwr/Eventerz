import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Home } from "lucide-react";

import { Background } from "@/components/layout/background";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * 404.
 *
 * Next ships a default for this, and it is an unstyled white page with
 * "404 | This page could not be found". On a site that is otherwise entirely
 * dark that reads as a crash rather than a missing page, and it is reachable by
 * the most ordinary route there is: a shared `/events/<id>` link for an event
 * that has since been deleted.
 *
 * Two exits rather than one. Someone who followed a dead event link wants
 * another event, not the marketing home page - so Explore is offered first.
 */
export default function NotFound() {
  return (
    <>
      <Background />
      <Navbar />
      <main className="relative">
        <div className="container flex min-h-[70vh] max-w-xl flex-col items-center justify-center py-24 text-center">
          <p className="font-mono text-sm tracking-widest text-brand-purple">
            404
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            This page has moved on
          </h1>
          <p className="mt-4 text-balance text-muted-foreground">
            The link may be out of date, or the event it pointed to was
            cancelled and removed by its host.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/explore">
                <Compass className="size-4" />
                Browse events
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">
                <Home className="size-4" />
                Go home
              </Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
