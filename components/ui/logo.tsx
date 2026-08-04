"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  /** Optional soft glow behind the mark (nice on dark surfaces). */
  glow?: boolean;
}

/**
 * Eventerz brand mark - a 3D extruded "E" with three purple facets: a near-white
 * top, a vivid violet front and a deep purple left side.
 *
 * # Why the gradient ids are generated rather than written
 *
 * They used to be the literal strings `ez-front`, `ez-top` and `ez-side`, and
 * the mark rendered as an empty box on every phone.
 *
 * `AppShell` draws `<Logo />` twice - once in the desktop sidebar, once in the
 * mobile header - and both are always in the DOM, with CSS deciding which one is
 * visible. So the page held two elements with `id="ez-front"`. A duplicate id is
 * normally harmless, because `url(#ez-front)` resolves to whichever comes first,
 * and the first here is the sidebar's.
 *
 * The sidebar is `hidden lg:flex`. Below `lg` that is `display: none`, and Blink
 * builds no paint server for a gradient inside a subtree it is not laying out.
 * The *visible* mobile logo therefore referenced a gradient that resolved to an
 * element with nothing behind it - and an SVG fill whose paint server cannot be
 * resolved paints nothing at all, rather than falling back to a colour. Hence a
 * correctly positioned, correctly sized, entirely invisible logo, on exactly the
 * breakpoint where the sidebar is hidden.
 *
 * `useId()` gives every instance its own ids, so no reference can land on
 * another copy. It is a hook, which is why this file is a client component; the
 * mark has no server-only dependencies, so that costs nothing.
 *
 * The colons React puts in `useId()` output are legal in an HTML id and in an
 * IRI reference, but not in a CSS selector - so anything that later tried
 * `querySelector('#' + id)` would break on them. Stripping them keeps the ids
 * boring.
 */
export function EventerzMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const front = `ez-front-${uid}`;
  const top = `ez-top-${uid}`;
  const side = `ez-side-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      role="img"
      aria-label="Eventerz"
    >
      <defs>
        <linearGradient
          id={front}
          x1="24"
          y1="18"
          x2="80"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#A97BFF" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient
          id={top}
          x1="14"
          y1="10"
          x2="80"
          y2="55"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F3EDFF" />
          <stop offset="1" stopColor="#D2BCFF" />
        </linearGradient>
        <linearGradient
          id={side}
          x1="14"
          y1="10"
          x2="24"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5B21B6" />
          <stop offset="1" stopColor="#3B1580" />
        </linearGradient>
      </defs>

      <g transform="translate(4 3)">
        {/* Dark left-side fold */}
        <path d="M24 18 L24 82 L14 74 L14 10 Z" fill={`url(#${side})`} />

        {/* Light top facets - the three bars of the E, seen from above */}
        <path d="M24 18 L80 18 L70 10 L14 10 Z" fill={`url(#${top})`} />
        <path d="M42 43 L72 43 L62 35 L32 35 Z" fill={`url(#${top})`} />
        <path d="M42 63 L80 63 L70 55 L32 55 Z" fill={`url(#${top})`} />

        {/* Bright front face */}
        <path
          d="M24 18 L80 18 L80 37 L42 37 L42 43 L72 43 L72 58 L42 58 L42 63 L80 63 L80 82 L24 82 Z"
          fill={`url(#${front})`}
        />
      </g>
    </svg>
  );
}

export function Logo({ className, showWordmark = true, glow = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* `shrink-0` so the mark keeps its square in a tight flex row - without
          it a long wordmark can squeeze the logo into a sliver. */}
      <span className="relative inline-flex size-9 shrink-0 items-center justify-center">
        <EventerzMark className="size-9 drop-shadow-[0_2px_10px_rgba(124,58,237,0.35)]" />
        {glow && (
          <span className="absolute inset-1 -z-10 rounded-full bg-brand-purple/40 blur-lg" />
        )}
      </span>
      {showWordmark && (
        <span className="font-display text-xl font-semibold tracking-tight text-white">
          Eventerz
        </span>
      )}
    </span>
  );
}
