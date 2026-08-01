"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LogOut,
  RefreshCw,
  Wallet as WalletIcon,
} from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { explorerClusterSuffix } from "@/lib/solana/cluster";
import { useConnectModal } from "./connect-modal-context";
import { cn } from "@/lib/utils";

interface ConnectWalletButtonProps {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  label?: string;
  fullWidth?: boolean;
}

function shorten(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

const cluster = explorerClusterSuffix();

export function ConnectWalletButton({
  variant = "primary",
  size = "default",
  className,
  label = "Connect Wallet",
  fullWidth,
}: ConnectWalletButtonProps) {
  const { open } = useConnectModal();
  const { connected, connecting, publicKey, wallet, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const address = publicKey?.toBase58();

  // Close dropdown on outside click.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  // --- Not connected ---
  if (!connected || !address) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={open}
        disabled={connecting}
        className={cn(fullWidth && "w-full", className)}
      >
        <WalletIcon className="size-4" />
        {connecting ? "Connecting..." : label}
      </Button>
    );
  }

  // --- Connected ---
  return (
    <div ref={ref} className={cn("relative", fullWidth && "w-full")}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className={cn(
          "flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 text-sm font-medium text-white backdrop-blur-md transition-colors hover:border-brand-purple/40 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/70",
          size === "sm" && "h-9",
          fullWidth && "w-full justify-center",
          className
        )}
        aria-expanded={menuOpen}
      >
        {wallet?.adapter.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt="" className="size-5 rounded-md" />
        ) : (
          <WalletIcon className="size-4 text-brand-purple" />
        )}
        <span className="hidden sm:inline">{shorten(address)}</span>
        <span className="inline sm:hidden">{shorten(address)}</span>
        <span className="size-1.5 rounded-full bg-brand-green" />
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            menuOpen && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className={cn(
              "absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-brand-bg-soft/95 p-1.5 shadow-card backdrop-blur-2xl",
              // Same guard as the notification panel: a fixed-width menu must
              // never be wider than the window it opens in.
              "max-w-[calc(100vw-2rem)]",
              fullWidth && "left-0 right-auto w-full"
            )}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
              {wallet?.adapter.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={wallet.adapter.icon}
                  alt=""
                  className="size-6 rounded-md"
                />
              ) : (
                <WalletIcon className="size-5 text-brand-purple" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {wallet?.adapter.name ?? "Wallet"}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {shorten(address)}
                </p>
              </div>
            </div>

            <MenuItem onClick={copyAddress}>
              {copied ? (
                <>
                  <Check className="size-4 text-brand-green" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy address
                </>
              )}
            </MenuItem>

            <a
              href={`https://explorer.solana.com/address/${address}${cluster}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ExternalLink className="size-4" />
              View on Explorer
            </a>

            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                open();
              }}
            >
              <RefreshCw className="size-4" />
              Change wallet
            </MenuItem>

            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                void disconnect();
              }}
              danger
            >
              <LogOut className="size-4" />
              Disconnect
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        danger
          ? "text-red-300 hover:bg-red-500/10"
          : "text-white/85 hover:bg-white/[0.06] hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
