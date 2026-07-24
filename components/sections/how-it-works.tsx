"use client";

import * as React from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { Workflow } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { steps } from "@/lib/data";
import { cn } from "@/lib/utils";

export function HowItWorks() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 65%", "end 55%"],
  });
  const scaleY = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <section id="how-it-works" className="section">
      <div className="container">
        <SectionHeading
          eyebrow="How it Works"
          icon={<Workflow className="size-3.5 text-brand-purple" />}
          title={
            <>
              From wallet to reputation in{" "}
              <span className="text-gradient">six steps</span>
            </>
          }
          description="A frictionless, on-chain journey — every step is verifiable, ownable and permanent."
        />

        <div ref={containerRef} className="relative mx-auto mt-16 max-w-4xl">
          {/* Base spine */}
          <div className="absolute inset-y-0 left-6 w-px bg-white/10 md:left-1/2 md:-translate-x-1/2" />
          {/* Animated spine */}
          <motion.div
            style={{ scaleY }}
            className="absolute inset-y-0 left-6 w-px origin-top bg-gradient-to-b from-brand-purple via-brand-blue to-brand-cyan md:left-1/2 md:-translate-x-1/2"
          />

          <ol className="space-y-10 md:space-y-0">
            {steps.map((step, i) => {
              const isLeft = i % 2 === 0;
              return (
                <li
                  key={step.index}
                  className="relative md:grid md:grid-cols-2 md:gap-x-16 md:pb-12"
                >
                  {/* Node */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="absolute left-6 top-1 z-10 flex size-12 -translate-x-1/2 items-center justify-center rounded-2xl border border-white/10 bg-brand-bg-soft shadow-glow md:left-1/2"
                  >
                    <div className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-20" />
                    <step.icon className="relative size-5 text-white" />
                  </motion.div>

                  {/* Card */}
                  <motion.div
                    initial={{ opacity: 0, x: isLeft ? -30 : 30, y: 20 }}
                    whileInView={{ opacity: 1, x: 0, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                      "pl-16 md:pl-0",
                      isLeft
                        ? "md:col-start-1 md:pr-16 md:text-right"
                        : "md:col-start-2 md:pl-16"
                    )}
                  >
                    <div className="group rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-brand-purple/30">
                      <div
                        className={cn(
                          "flex items-center gap-3",
                          isLeft && "md:flex-row-reverse"
                        )}
                      >
                        <span className="font-display text-3xl font-bold text-white/15">
                          {step.index}
                        </span>
                        <h3 className="font-display text-lg font-semibold text-white">
                          {step.title}
                        </h3>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </motion.div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
