"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  ShieldCheck,
  Wallet as WalletIcon,
  X,
} from "lucide-react";
import { useRecordPayment } from "@/lib/hooks/use-eventerz-data";
import { useConnectModal } from "@/components/wallet/connect-modal-context";
import { Avatar } from "./avatar";
import { Button } from "@/components/ui/button";
import {
  fromBaseUnits,
  lamportsToSol,
  maxSendableLamports,
  solToLamports,
} from "@/lib/solana/amount";
import { explorerTxUrl } from "@/lib/solana/cluster";
import { confirmSignature } from "@/lib/solana/confirm";
import { memoInstruction } from "@/lib/solana/memo";
import {
  describeSigningError,
  isWalletCancellation,
} from "@/lib/wallet-errors";
import { shortenAddress } from "@/lib/format";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { cn } from "@/lib/utils";

interface Recipient {
  id: string;
  name: string;
  /** Null when they have never linked one - the blocking case. */
  walletAddress: string | null;
  /** Optional: callers that only know an id and a name still work. */
  avatarUrl?: string | null;
}

interface SendCryptoDialogProps {
  open: boolean;
  onClose: () => void;
  recipient: Recipient;
  /** The DM channel the receipt is posted into. */
  channelId: string;
}

type Phase = "form" | "signing" | "confirming" | "recording" | "done";

const QUICK_AMOUNTS = ["0.01", "0.05", "0.1", "0.5"];

/**
 * Send SOL to someone from the thread you are talking to them in.
 *
 * # The order of operations, and why it is this one
 *
 * The transfer happens on-chain **first**, and the receipt is written only
 * after the cluster has confirmed it. The other ordering - record, then send -
 * is tempting because it gives the UI something to render immediately, and it
 * is wrong: a receipt for a transfer that then fails is a lie the recipient
 * acts on, and there is no way to un-tell someone they were paid.
 *
 * `record_payment` is idempotent on the signature, so the failure mode of this
 * ordering is benign: if the app dies between confirmation and recording, the
 * money has moved and the receipt is missing, and calling again with the same
 * signature files it exactly once.
 *
 * # What this does not do
 *
 * SPL tokens. The plumbing is token-agnostic all the way down - `payments`
 * stores a mint, decimals and a symbol, and `verify-payment` checks token
 * balances - but the instruction here is a native transfer, because sending an
 * SPL token means resolving or creating an associated token account for the
 * recipient and paying its rent, which is a materially different conversation
 * to have in a chat window.
 */
export function SendCryptoDialog({
  open,
  onClose,
  recipient,
  channelId,
}: SendCryptoDialogProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { open: openWalletModal } = useConnectModal();
  const record = useRecordPayment(channelId);

  const [amount, setAmount] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("form");
  const [error, setError] = React.useState("");
  const [signature, setSignature] = React.useState("");
  const [balance, setBalance] = React.useState<bigint | null>(null);

  useScrollLock(open);

  // Reset every time the dialog opens, so a previous success is not still on
  // screen when someone comes back to send a second time.
  React.useEffect(() => {
    if (!open) return;
    setAmount("");
    setMemo("");
    setPhase("form");
    setError("");
    setSignature("");
  }, [open]);

  // Balance, so the form can refuse an amount before the wallet has to.
  React.useEffect(() => {
    if (!open || !publicKey) return;
    let cancelled = false;

    void connection
      .getBalance(publicKey)
      .then((lamports) => {
        if (!cancelled) setBalance(BigInt(lamports));
      })
      .catch(() => {
        // A balance we cannot read is not a reason to block the send - the
        // wallet will refuse an over-spend anyway. It only costs the preview.
        if (!cancelled) setBalance(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, publicKey, connection]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "form") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase, onClose]);

  const max = balance === null ? null : maxSendableLamports(balance);

  /** Parse without throwing, so the form can validate as the user types. */
  const parsed = React.useMemo(() => {
    if (!amount.trim()) return null;
    try {
      return solToLamports(amount);
    } catch {
      return null;
    }
  }, [amount]);

  const validationError = (() => {
    if (!amount.trim()) return null;
    if (parsed === null) return "Enter an amount like 0.25";
    if (parsed <= 0n) return "Enter an amount greater than zero.";
    if (max !== null && parsed > max) {
      return `That is more than you can send. You have ${lamportsToSol(balance ?? 0n)} SOL.`;
    }
    return null;
  })();

  const canSend =
    connected &&
    Boolean(publicKey) &&
    Boolean(recipient.walletAddress) &&
    parsed !== null &&
    parsed > 0n &&
    !validationError &&
    phase === "form";

  const send = async () => {
    if (!publicKey || !recipient.walletAddress || parsed === null) return;
    setError("");

    let destination: PublicKey;
    try {
      destination = new PublicKey(recipient.walletAddress);
    } catch {
      setError("That recipient's wallet address is not valid.");
      return;
    }

    if (destination.equals(publicKey)) {
      setError("That is your own wallet.");
      return;
    }

    /*
     * Tracked in a local, not read back off `signature` state, because the catch
     * below needs it. `setSignature` schedules a re-render; it does not change
     * the `signature` binding this closure already captured, so the catch would
     * still see "" and would tell someone their transfer failed without
     * mentioning it had been submitted - the exact mistake the message exists to
     * prevent.
     */
    let sent = "";

    try {
      setPhase("signing");

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: destination,
          // `SystemProgram.transfer` takes a number or bigint; bigint keeps the
          // value exact all the way to the instruction.
          lamports: parsed,
        }),
      );

      /*
       * The memo goes on-chain, not just into `payments.memo`.
       *
       * It used to do only the latter: the note was written to the database and
       * rendered in the receipt, while the transaction stayed a bare transfer.
       * So the receipt displayed a memo beside a signature that did not carry
       * one - a claim the chain could not corroborate - and the wallet's
       * approval sheet, the last thing anyone reads before money moves, could
       * say nothing about what the payment was for. See `lib/solana/memo.ts`.
       */
      const note = memo.trim();
      if (note) transaction.add(memoInstruction(note));

      sent = await sendTransaction(transaction, connection);
      setSignature(sent);
      setPhase("confirming");

      /*
       * Wait for confirmation before writing anything. `confirmed` rather than
       * `finalized`: finalisation takes ~13 seconds and a confirmed transfer is
       * not going to be rolled back in practice, so the extra wait buys a
       * guarantee nobody is asking for at the cost of a chat message that
       * appears to hang.
       */
      const result = await confirmSignature(
        connection,
        { signature: sent, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      if (result.value.err) {
        throw new Error("The network rejected that transfer.");
      }

      setPhase("recording");
      await record.mutateAsync({
        signature: sent,
        toWallet: recipient.walletAddress,
        toProfile: recipient.id,
        amount: parsed,
        channelId,
        memo: memo.trim() || undefined,
      });

      setPhase("done");
    } catch (err) {
      /*
       * A user declining in their wallet is not an error worth a red box - they
       * did exactly what they meant to. Close quietly.
       *
       * This used to test `err.message` against a local
       * "user rejected|declined|denied" regex, which missed the most common way
       * of backing out in a browser: closing the popup throws
       * `WalletWindowClosedError`, and wallet-adapter puts that meaning in
       * `error.name` rather than in the message. `isWalletCancellation` reads
       * both - it is the same rule the connect flow already uses, and there was
       * never a reason for a weaker second copy of it here.
       */
      if (isWalletCancellation(err)) {
        setPhase("form");
        return;
      }

      /*
       * Keep a sentence we wrote - "The network rejected that transfer." is
       * thrown above and is more useful than any rewrite - but never show a
       * bare library error name or a TypeError.
       */
      const message =
        describeSigningError(err) ?? "Could not send that transfer.";

      setError(
        sent
          ? // The money may have moved. Say so - telling someone a transfer
            // failed when it did not is the worse of the two mistakes.
            `${message} The transaction was submitted - check the explorer before sending again.`
          : message,
      );
      setPhase("form");
    }
  };

  const busy = phase !== "form" && phase !== "done";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Send crypto to ${recipient.name}`}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => !busy && onClose()}
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            /*
             * Capped to the window, with the body scrolling inside.
             *
             * The card was `overflow-hidden` with no height limit, so on a
             * short viewport - a landscape phone, a small laptop, a browser
             * with devtools open - the bottom of the form was clipped with no
             * way to reach it. That put the Send button out of reach on a form
             * that moves real money. The header and the "never holds your
             * funds" footer stay pinned; only the middle scrolls.
             *
             * `dvh` rather than `vh`: on mobile browsers `vh` counts the space
             * behind the retracting address bar, which is exactly the height
             * this must not assume it has.
             */
            className="gradient-border relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-brand-bg-soft/95 shadow-card backdrop-blur-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-5">
              <div className="flex items-center gap-3">
                <Avatar name={recipient.name} seed={recipient.id} size="md" src={recipient.avatarUrl} />
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">
                    Send SOL
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    to {recipient.name}
                    {recipient.walletAddress
                      ? ` · ${shortenAddress(recipient.walletAddress)}`
                      : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={busy}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* The only part that scrolls. `min-h-0` is required for a flex
                child to be allowed to shrink below its content height. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {/* Blocking states first - an amount field is pointless if the
                  transfer cannot happen. */}
              {!recipient.walletAddress ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
                  <p className="font-semibold">
                    {recipient.name} has not linked a wallet
                  </p>
                  <p className="mt-1 text-xs opacity-90">
                    There is nowhere to send to yet. They can link one from their
                    profile.
                  </p>
                </div>
              ) : !connected ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center">
                  <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-brand-purple/15 text-brand-purple">
                    <WalletIcon className="size-5" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-white">
                    Connect a wallet to send
                  </p>
                  <Button className="mt-4 w-full" onClick={openWalletModal}>
                    <WalletIcon className="size-4" />
                    Connect wallet
                  </Button>
                </div>
              ) : phase === "done" ? (
                <div className="text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-green/15 text-brand-green">
                    <Check className="size-6" />
                  </div>
                  <p className="mt-3 font-display text-lg font-semibold text-white">
                    Sent {amount} SOL
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The receipt is in your conversation with{" "}
                    {recipient.name.split(" ")[0]}.
                  </p>
                  <a
                    href={explorerTxUrl(signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-brand-cyan hover:underline"
                  >
                    View on Explorer
                    <ArrowRight className="size-3.5" />
                  </a>
                  <Button variant="secondary" className="mt-5 w-full" onClick={onClose}>
                    Done
                  </Button>
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-sm font-medium text-white">Amount</span>
                      {balance !== null && (
                        <span className="text-xs text-muted-foreground">
                          Balance {lamportsToSol(balance)} SOL
                        </span>
                      )}
                    </span>
                    <div className="relative">
                      <input
                        inputMode="decimal"
                        autoFocus
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.0"
                        disabled={busy}
                        className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-4 pr-16 font-display text-2xl font-semibold text-white placeholder:text-muted-foreground/50 focus:border-brand-purple/40 focus:outline-none disabled:opacity-60"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                        SOL
                      </span>
                    </div>
                  </label>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {QUICK_AMOUNTS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={busy}
                        onClick={() => setAmount(value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          amount === value
                            ? "border-brand-purple/50 bg-brand-purple/15 text-white"
                            : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white",
                        )}
                      >
                        {value}
                      </button>
                    ))}
                    {max !== null && max > 0n && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAmount(fromBaseUnits(max, 9))}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-white"
                      >
                        Max
                      </button>
                    )}
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-sm font-medium text-white">
                      Note (optional)
                    </span>
                    <input
                      value={memo}
                      onChange={(e) => setMemo(e.target.value.slice(0, 200))}
                      placeholder="Ticket split for Friday"
                      disabled={busy}
                      className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none disabled:opacity-60"
                    />
                  </label>

                  {(validationError || error) && (
                    <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      <p className="flex items-start gap-1.5">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        {validationError ?? error}
                      </p>
                      {/* If it was submitted, "check the explorer" needs to be a
                          link. Telling someone to go and look without saying
                          where is the dead end this message was meant to avoid. */}
                      {!validationError && signature && (
                        <a
                          href={explorerTxUrl(signature)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 pl-5 font-medium text-red-200 underline underline-offset-2 hover:text-white"
                        >
                          View transaction
                          <ArrowRight className="size-3" />
                        </a>
                      )}
                    </div>
                  )}

                  <Button
                    className="mt-5 w-full"
                    size="lg"
                    disabled={!canSend}
                    onClick={() => void send()}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    {phase === "signing"
                      ? "Approve in your wallet..."
                      : phase === "confirming"
                        ? "Confirming on-chain..."
                        : phase === "recording"
                          ? "Filing the receipt..."
                          : `Send${amount ? ` ${amount} SOL` : ""}`}
                  </Button>
                </>
              )}
            </div>

            <div className="flex shrink-0 items-start gap-2 border-t border-white/10 px-5 py-3.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-green" />
              Eventerz never holds your funds. The transfer goes straight from
              your wallet to theirs, and you approve it there.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Exposed so the receipt bubble and the dialog agree on formatting. */
export { LAMPORTS_PER_SOL };
