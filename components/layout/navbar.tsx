"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { navLinks, siteConfig } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Magnetic } from "@/components/ui/magnetic";
import { NavAuth } from "@/components/auth/nav-auth";
import { useScrollLock } from "@/hooks";

export function Navbar() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  useScrollLock(open);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on Escape
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3 sm:pt-4">
        <motion.nav
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "flex w-full max-w-6xl items-center justify-between gap-4 rounded-2xl border px-4 py-2.5 transition-all duration-300 sm:px-5",
            scrolled
              ? "border-white/10 bg-brand-bg/70 shadow-card backdrop-blur-xl"
              : "border-transparent bg-transparent"
          )}
        >
          <Link
            href="#top"
            className="rounded-lg focus-glow"
            aria-label="Eventerz - home"
          >
            <Logo />
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white focus-glow"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <NavAuth />
            </div>
            <Magnetic className="hidden sm:block">
              <Button asChild size="sm">
                <Link href="/dashboard">
                  Let&apos;s Event
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </Magnetic>

            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="relative z-50 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] lg:hidden focus-glow"
            >
              <span className="sr-only">Toggle menu</span>
              <div className="flex w-5 flex-col items-center justify-center gap-1">
                <motion.span
                  animate={open ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="h-0.5 w-5 rounded-full bg-white"
                />
                <motion.span
                  animate={open ? { opacity: 0, x: -6 } : { opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="h-0.5 w-5 rounded-full bg-white"
                />
                <motion.span
                  animate={open ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="h-0.5 w-5 rounded-full bg-white"
                />
              </div>
            </button>
          </div>
        </motion.nav>
      </header>

      {/* Mobile menu panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-brand-bg/80 backdrop-blur-xl"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-4 top-20 rounded-3xl border border-white/10 bg-brand-bg-soft/90 p-4 shadow-card backdrop-blur-2xl"
            >
              <nav className="flex flex-col gap-1">
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.05 }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-base font-medium text-white/90 transition-colors hover:bg-white/[0.05]"
                    >
                      {link.label}
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </Link>
                  </motion.div>
                ))}
              </nav>
              <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-4">
                <NavAuth mobile onNavigate={() => setOpen(false)} />
                <Button asChild className="w-full" onClick={() => setOpen(false)}>
                  <Link href="/dashboard">
                    Let&apos;s Event
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </div>
              <p className="mt-4 px-2 text-center text-xs text-muted-foreground">
                {siteConfig.tagline}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
