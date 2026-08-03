"use client";

/**
 * Door check-in.
 *
 * # Why this page exists
 *
 * A ticket QR used to encode `eventerz:v1:checkin?ticket=..&secret=..`. Nothing
 * outside the mobile app understands a custom scheme, so pointing an ordinary
 * phone camera at a ticket produced "No usable data found" - and a host whose
 * in-app scanner would not open had no route at all from the code in front of
 * them to a check-in.
 *
 * Tickets now carry `https://<site>/checkin?ticket=..&secret=..`. Every camera
 * on both platforms resolves that. On a phone with the app installed Android
 * hands it to the app; everywhere else it lands here, and this page does the
 * same job.
 *
 * # Why it does not verify anything itself
 *
 * It calls `check_in_ticket` (migration 0002) and shows what comes back. The
 * secret comparison, the host check and the once-only rule are all server-side
 * in a SECURITY DEFINER function, which is the only place they can be trusted -
 * this page is handed the ticket id and secret by whoever scanned the code, and
 * has no way to know who that is.
 */

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Loader2,
  QrCode,
  ShieldAlert,
  TicketCheck,
} from "lucide-react";

import { checkInTicket } from "@/lib/supabase/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useSession } from "@/components/auth/use-session";
import { PageHeader } from "@/components/app/page-header";

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; serial: number; tier: string }
  | { kind: "error"; message: string };

/**
 * Postgres' words, rewritten for somebody standing at a door with a queue.
 *
 * "invalid ticket code" is accurate and, in that moment, indistinguishable from
 * "this app is broken". Each of these says what to do next instead.
 */
function explain(message: string): string {
  if (/not authenticated|28000/i.test(message)) {
    return "Sign in first - a check-in is recorded against you as the host.";
  }
  if (/only the event host/i.test(message)) {
    return "That ticket belongs to an event you do not host. Only its host can check guests in.";
  }
  if (/already been checked in/i.test(message)) {
    return "This guest is already checked in.";
  }
  if (/invalid ticket code|ticket not found/i.test(message)) {
    return "That code did not match a valid ticket. Ask the guest to reopen it from their Tickets page.";
  }
  return message || "Could not check this ticket in.";
}

export default function CheckInPage() {
  const params = useSearchParams();
  const { isSignedIn, isLoading } = useSession();

  const ticket = params.get("ticket");
  const secret = params.get("secret");

  const [state, setState] = React.useState<State>({ kind: "idle" });

  /*
   * One attempt per code. Without the ref, React's development double-invoke
   * and any re-render during the request would fire a second check-in, and the
   * second one reports "already checked in" for the check-in the first one just
   * performed - a success that reads as a failure.
   */
  const attempted = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!ticket || !secret) return;
    if (!isSupabaseConfigured) return;
    // Wait for the session to resolve; redeeming before it does would send an
    // anonymous request and be told to sign in when the user already is.
    if (isLoading || !isSignedIn) return;

    const key = `${ticket}:${secret}`;
    if (attempted.current === key) return;
    attempted.current = key;

    setState({ kind: "working" });
    checkInTicket(ticket, secret)
      .then((row) =>
        setState({ kind: "done", serial: row.serial, tier: row.tier })
      )
      .catch((error: unknown) =>
        setState({
          kind: "error",
          message: explain(
            error instanceof Error ? error.message : String(error)
          ),
        })
      );
  }, [ticket, secret, isSignedIn, isLoading]);

  const missing = !ticket || !secret;

  return (
    <div>
      <PageHeader
        eyebrow="Door"
        title="Check-in"
        description="Scanned a guest's ticket. Only the event's host can admit them."
      />

      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        {missing ? (
          <>
            <QrCode className="mx-auto size-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold text-white">
              Nothing to check in
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Open this page by scanning a guest&apos;s ticket QR code.
            </p>
          </>
        ) : isLoading ? (
          <Loader2 className="mx-auto size-8 animate-spin text-brand-purple" />
        ) : !isSignedIn ? (
          <>
            <ShieldAlert className="mx-auto size-10 text-amber-400" />
            <h2 className="mt-4 text-lg font-semibold text-white">
              Sign in to check this guest in
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Attendance is recorded against the host, so we need to know who
              you are. Sign in and this page will finish automatically.
            </p>
          </>
        ) : state.kind === "working" || state.kind === "idle" ? (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-brand-purple" />
            <p className="mt-4 text-sm text-muted-foreground">
              Checking this ticket in...
            </p>
          </>
        ) : state.kind === "done" ? (
          <>
            <BadgeCheck className="mx-auto size-12 text-emerald-400" />
            <h2 className="mt-4 text-xl font-bold text-white">Checked in</h2>
            <p className="mt-1 font-mono text-sm text-brand-cyan">
              #{String(state.serial).padStart(4, "0")} · {state.tier}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Attendance is on-chain and the guest&apos;s Proof-of-Attendance
              badge is on its way.
            </p>
          </>
        ) : (
          <>
            <TicketCheck className="mx-auto size-10 text-rose-400" />
            <h2 className="mt-4 text-lg font-semibold text-white">
              Could not check in
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {state.message}
            </p>
          </>
        )}

        <Link
          href="/my-events"
          className="mt-8 inline-flex h-11 items-center rounded-2xl border border-white/10 px-5 text-sm font-semibold text-white transition-colors hover:border-brand-purple/40"
        >
          Back to my events
        </Link>
      </div>
    </div>
  );
}
