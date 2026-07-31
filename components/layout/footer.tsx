"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Github,
  Loader2,
  MessageCircle,
  Twitter,
} from "lucide-react";
import { siteConfig } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { subscribeToNewsletter } from "@/lib/supabase/data";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * `external` opens in a new tab with `rel="noopener noreferrer"`; it also marks
 * the links that must not go through `next/link`, which prefetches and
 * client-navigates - neither of which means anything for a URL on someone
 * else's origin, or for a `mailto:`.
 */
const footerColumns: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it Works", href: "#how-it-works" },
      { label: "Demo", href: "#demo" },
      { label: "Roadmap", href: "#roadmap" },
      { label: "Docs", href: siteConfig.links.docs },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", href: siteConfig.links.github, external: true },
      { label: "Twitter", href: siteConfig.links.twitter, external: true },
      { label: "Discord", href: siteConfig.links.discord, external: true },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      {
        label: "Contact",
        href: "mailto:eventerz.web@gmail.com",
        external: true,
      },
    ],
  },
];

const socials = [
  { label: "Twitter", href: siteConfig.links.twitter, icon: Twitter },
  { label: "GitHub", href: siteConfig.links.github, icon: Github },
  { label: "Discord", href: siteConfig.links.discord, icon: MessageCircle },
];

/**
 * Newsletter signup.
 *
 * This used to set a "Joined" state and discard the address. That is worse than
 * having no form at all - it promises someone they will hear from you and
 * guarantees they will not. It now writes to `newsletter_subscribers` through
 * `subscribe_newsletter`, and says so only once the write has succeeded.
 *
 * When Supabase is not configured (a fresh clone running the demo) the field is
 * disabled rather than accepting input it cannot store.
 */
function NewsletterForm() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<
    "idle" | "saving" | "done" | "error"
  >("idle");
  const [error, setError] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address || status === "saving") return;

    setStatus("saving");
    setError("");
    try {
      await subscribeToNewsletter(address);
      setStatus("done");
      setEmail("");
      window.setTimeout(() => setStatus("idle"), 5000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not subscribe. Please try again.",
      );
      setStatus("error");
    }
  };

  const submitted = status === "done";
  const saving = status === "saving";

  if (!isSupabaseConfigured) {
    return (
      <p className="mt-5 max-w-sm text-sm text-muted-foreground">
        Follow{" "}
        <a
          href={siteConfig.links.twitter}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-cyan underline underline-offset-2 hover:text-white"
        >
          @eventerz_web
        </a>{" "}
        for product updates and ecosystem drops.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1.5 pl-4 backdrop-blur-md transition-colors focus-within:border-brand-purple/40">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={saving}
          placeholder="you@wallet.sol"
          aria-label="Email address"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
        />
        <Button type="submit" size="sm" className="shrink-0" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Joining
            </>
          ) : submitted ? (
            <>
              <Check className="size-4" />
              Joined
            </>
          ) : (
            <>
              Subscribe
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
      <p
        className="mt-2 pl-4 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {status === "error" ? (
          <span className="text-red-300">{error}</span>
        ) : submitted ? (
          "You're on the list. We'll be in touch."
        ) : (
          "Product updates & ecosystem drops. No spam, unsubscribe anytime."
        )}
      </p>
    </form>
  );
}

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/10">
      {/* top glow */}
      <div className="pointer-events-none absolute inset-x-0 -top-px mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-brand-purple/50 to-transparent" />

      <div className="container relative py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand + newsletter */}
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {siteConfig.description}
            </p>
            <NewsletterForm />
          </div>

          {/* Link columns */}
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-white">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => {
                  const className =
                    "group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-white";
                  const inner = (
                    <>
                      {link.label}
                      <ArrowRight className="size-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </>
                  );

                  return (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={className}
                        >
                          {inner}
                        </a>
                      ) : (
                        <Link href={link.href} className={className}>
                          {inner}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-6 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {siteConfig.name}. Built on Solana. All
            rights reserved.
          </p>
          <div className="flex items-center gap-2">
            {socials.map((s) => (
              <motion.a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                whileHover={{ y: -3 }}
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground transition-colors hover:border-brand-purple/40 hover:text-white"
                )}
              >
                <s.icon className="size-4" />
              </motion.a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
