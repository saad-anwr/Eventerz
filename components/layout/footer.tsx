"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Github, Twitter, MessageCircle } from "lucide-react";
import { siteConfig } from "@/lib/site";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const footerColumns = [
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
      { label: "GitHub", href: siteConfig.links.github },
      { label: "Twitter", href: siteConfig.links.twitter },
      { label: "Discord", href: siteConfig.links.discord },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Contact", href: "mailto:hello@eventerz.xyz" },
    ],
  },
];

const socials = [
  { label: "Twitter", href: siteConfig.links.twitter, icon: Twitter },
  { label: "GitHub", href: siteConfig.links.github, icon: Github },
  { label: "Discord", href: siteConfig.links.discord, icon: MessageCircle },
];

function NewsletterForm() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    // Placeholder — wire to your provider (Supabase, Resend, ConvertKit…).
    setSubmitted(true);
    setEmail("");
    window.setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5 w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1.5 pl-4 backdrop-blur-md transition-colors focus-within:border-brand-purple/40">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@wallet.sol"
          aria-label="Email address"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-muted-foreground focus:outline-none"
        />
        <Button type="submit" size="sm" className="shrink-0">
          {submitted ? (
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
      <p className="mt-2 pl-4 text-xs text-muted-foreground">
        Product updates & ecosystem drops. No spam, unsubscribe anytime.
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
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-white"
                    >
                      {link.label}
                      <ArrowRight className="size-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-6 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {2026} {siteConfig.name}. Built on Solana. All rights reserved.
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
