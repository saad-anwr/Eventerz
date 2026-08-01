"use client";

/**
 * Account deletion.
 *
 * Deliberately plain about what happens, because the interesting part of
 * deleting an account here is what *survives* it. Somebody who hosted an event
 * and then deletes their account should not discover afterwards that the event
 * is still listed - so the list below is shown before the button, not in a
 * help article.
 *
 * Two-step by design: the confirm step requires typing the word, which is the
 * standard guard for an action with no undo. There is no undo here in the
 * strongest sense - the profile is overwritten in place, so there is no soft
 * "deleted" flag to flip back.
 */

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { deleteAccount } from "@/lib/supabase/auth-service";
import { Button } from "@/components/ui/button";

const CONFIRM_WORD = "DELETE";

export function DeleteAccountCard() {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);

    const result = await deleteAccount();

    if (!result.ok) {
      setError(result.error ?? "Could not delete your account.");
      setBusy(false);
      return;
    }

    /*
     * A full reload rather than a router push. Every store, provider and cached
     * query in this tab still holds the deleted account; navigating would leave
     * that state in memory and the UI would keep rendering a user who no longer
     * exists until something happened to refetch.
     */
    window.location.href = "/";
  }

  return (
    <section
      aria-labelledby="danger-zone-heading"
      className="rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-5"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-400" />
        <div className="min-w-0 flex-1">
          <h2
            id="danger-zone-heading"
            className="font-display text-base font-semibold text-white"
          >
            Delete account
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Permanently erases your name, avatar, bio, email address and wallet
            link. This cannot be undone.
          </p>

          <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <p className="text-white/70">What stays, and why:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Events you hosted, so guests keep the tickets they already hold.
                Your name is removed from them.
              </li>
              <li>
                Payment receipts, which are the other person&rsquo;s record of
                money that moved. The transactions are on-chain regardless.
              </li>
              <li>
                Messages you sent, with the text replaced by
                &ldquo;[deleted]&rdquo;.
              </li>
            </ul>
          </div>

          {!open ? (
            <Button
              variant="outline"
              className="mt-4 border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
              onClick={() => setOpen(true)}
            >
              Delete my account
            </Button>
          ) : (
            <div className="mt-4 space-y-3">
              <label
                htmlFor="confirm-delete"
                className="block text-sm text-white/80"
              >
                Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span>{" "}
                to confirm.
              </label>
              <input
                id="confirm-delete"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                disabled={busy}
                className="w-full max-w-xs rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm text-white outline-none focus:border-red-500/60"
              />

              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  disabled={typed !== CONFIRM_WORD || busy}
                  onClick={handleDelete}
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Permanently delete"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    setTyped("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
