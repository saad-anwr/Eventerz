"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, PlayCircle, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { HeroDashboard } from "@/components/sections/hero-dashboard";
import { heroStats } from "@/lib/data";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden px-4 pb-16 pt-32 sm:pt-40"
    >
      <div className="container relative flex flex-col items-center text-center">
        {/* Eyebrow */}
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <Link
            href="#features"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-4 text-sm backdrop-blur-md transition-colors hover:border-brand-purple/40"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-2.5 py-0.5 text-xs font-semibold text-white">
              <Sparkles className="size-3" />
              New
            </span>
            <span className="text-muted-foreground transition-colors group-hover:text-white">
              Live on Solana — the wallet-native event layer
            </span>
            <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>

        {/* Heading */}
        <motion.h1
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-7 max-w-4xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-white text-balance sm:text-6xl md:text-7xl"
        >
          Wallet-native Events
          <br className="hidden sm:block" /> for the{" "}
          <span className="text-gradient-animated">Future.</span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty sm:text-xl"
        >
          <span className="font-semibold text-white/90">
            Create. Discover. Attend.
          </span>{" "}
          Own your event experience completely on-chain — NFT tickets,
          proof-of-attendance and portable reputation, powered by Solana.
        </motion.p>

        {/* CTAs */}
        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Magnetic>
            <Button asChild size="lg">
              <Link href="#cta">
                Launch App
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </Magnetic>
          <Button asChild size="lg" variant="secondary">
            <Link href="#demo">
              <PlayCircle className="size-4" />
              View Demo
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="#demo">
              <Wallet className="size-4" />
              Connect Wallet
            </Link>
          </Button>
        </motion.div>

        {/* Hero illustration */}
        <motion.div
          initial={{ opacity: 0, y: 48, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-16 w-full sm:mt-20"
        >
          <HeroDashboard />
        </motion.div>

        {/* Stats */}
        <motion.dl
          custom={4}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-16 grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-md sm:grid-cols-4"
        >
          {heroStats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-1 bg-white/[0.02] p-5"
            >
              <dd className="font-display text-2xl font-bold text-white sm:text-3xl">
                <AnimatedCounter
                  value={stat.value}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  decimals={stat.value < 1 ? 4 : 0}
                />
              </dd>
              <dt className="text-center text-xs text-muted-foreground">
                {stat.label}
              </dt>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}
