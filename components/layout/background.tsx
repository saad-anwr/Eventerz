"use client";

import dynamic from "next/dynamic";

// Particle canvas is client-only & non-critical — load lazily.
const Particles = dynamic(
  () => import("@/components/ui/particles").then((m) => m.Particles),
  { ssr: false }
);

/**
 * Fixed, full-viewport ambient backdrop shared by the whole page:
 * deep-space base, masked grid, drifting gradient blobs and particles.
 * Purely decorative and pointer-events-none so it never blocks the UI.
 */
export function Background() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-brand-bg"
    >
      {/* Masked grid */}
      <div className="absolute inset-0 bg-grid-pattern bg-[size:56px_56px] opacity-[0.35] mask-radial-faded" />

      {/* Ambient gradient blobs */}
      <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-brand-purple/20 blur-[130px] animate-pulse-glow" />
      <div
        className="absolute -right-40 top-1/3 h-[32rem] w-[32rem] rounded-full bg-brand-blue/15 blur-[130px] animate-pulse-glow"
        style={{ animationDelay: "1.5s" }}
      />
      <div
        className="absolute bottom-0 left-1/4 h-[30rem] w-[30rem] rounded-full bg-brand-cyan/10 blur-[130px] animate-pulse-glow"
        style={{ animationDelay: "3s" }}
      />

      {/* Particle field */}
      <Particles quantity={64} />

      {/* Subtle top vignette to seat the navbar */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand-bg to-transparent" />
    </div>
  );
}
