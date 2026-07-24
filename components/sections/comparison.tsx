"use client";

import { motion } from "framer-motion";
import { Check, Minus, X, Trophy } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { comparisonColumns, comparisonRows } from "@/lib/data";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

function Cell({
  state,
}: {
  state: "yes" | "no" | "partial";
}) {
  if (state === "yes")
    return (
      <span className="mx-auto flex size-7 items-center justify-center rounded-full bg-brand-green/15 text-brand-green">
        <Check className="size-4" strokeWidth={2.5} />
      </span>
    );
  if (state === "partial")
    return (
      <span className="mx-auto flex size-7 items-center justify-center rounded-full bg-yellow-400/10 text-yellow-400/80">
        <Minus className="size-4" strokeWidth={2.5} />
      </span>
    );
  return (
    <span className="mx-auto flex size-7 items-center justify-center rounded-full bg-white/5 text-white/25">
      <X className="size-4" strokeWidth={2.5} />
    </span>
  );
}

export function Comparison() {
  return (
    <section className="section">
      <div className="container">
        <SectionHeading
          eyebrow="Why Eventerz"
          icon={<Trophy className="size-3.5 text-brand-purple" />}
          title={
            <>
              The only platform built{" "}
              <span className="text-gradient">wallet-first</span>
            </>
          }
          description="See how Eventerz compares to the Web2 incumbents across the primitives that matter for Web3 communities."
        />

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7 }}
          className="mt-14"
        >
          {/* scrollable on small screens, full-width from sm up */}
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:overflow-visible sm:px-0">
            <div className="mx-auto min-w-[600px] max-w-4xl sm:min-w-0">
              <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
                {/* Header */}
                <div className="p-4 sm:p-5" />
                {comparisonColumns.map((col) => {
                  const isEventerz = col === "Eventerz";
                  return (
                    <div
                      key={col}
                      className={cn(
                        "flex items-center justify-center p-4 text-center sm:p-5",
                        isEventerz && "relative bg-brand-purple/[0.08]"
                      )}
                    >
                      {isEventerz && (
                        <span className="pointer-events-none absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-brand-purple to-transparent" />
                      )}
                      {isEventerz ? (
                        <Logo showWordmark={false} className="scale-90" />
                      ) : null}
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          isEventerz ? "ml-1.5 text-white" : "text-muted-foreground"
                        )}
                      >
                        {col}
                      </span>
                    </div>
                  );
                })}

                {/* Rows */}
                {comparisonRows.map((row, rowIdx) => (
                  <div key={row.feature} className="contents">
                    <div
                      className={cn(
                        "flex items-center border-t border-white/[0.06] p-4 text-sm font-medium text-white/90 sm:p-5"
                      )}
                    >
                      {row.feature}
                    </div>
                    {comparisonColumns.map((col, colIdx) => {
                      const isEventerz = col === "Eventerz";
                      const state: "yes" | "no" | "partial" = row.values[colIdx]
                        ? "yes"
                        : row.partial?.[colIdx]
                          ? "partial"
                          : "no";
                      return (
                        <div
                          key={col}
                          className={cn(
                            "flex items-center justify-center border-t border-white/[0.06] p-4 sm:p-5",
                            isEventerz && "bg-brand-purple/[0.08]",
                            isEventerz &&
                              rowIdx === comparisonRows.length - 1 &&
                              "rounded-b-3xl"
                          )}
                        >
                          <Cell state={state} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* legend */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-brand-green" /> Supported
            </span>
            <span className="flex items-center gap-1.5">
              <Minus className="size-3.5 text-yellow-400/80" /> Partial
            </span>
            <span className="flex items-center gap-1.5">
              <X className="size-3.5 text-white/30" /> Not available
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
