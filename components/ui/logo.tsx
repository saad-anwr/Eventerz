import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  /** Optional soft glow behind the mark (nice on dark surfaces). */
  glow?: boolean;
}

/**
 * Eventerz brand mark - a 3D isometric, folded-ribbon "E" with three purple
 * facets (light top, violet front, dark side). Pure vector: crisp at any size.
 */
export function EventerzMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ez-front" x1="24" y1="18" x2="80" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A374FF" />
          <stop offset="1" stopColor="#7A2BE0" />
        </linearGradient>
        <linearGradient id="ez-top" x1="14" y1="10" x2="80" y2="55" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E7DCFF" />
          <stop offset="1" stopColor="#C2A9FF" />
        </linearGradient>
        <linearGradient id="ez-side" x1="14" y1="10" x2="24" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5C24AE" />
          <stop offset="1" stopColor="#3E1A80" />
        </linearGradient>
      </defs>

      <g transform="translate(4 3)">
        {/* Dark left-side fold */}
        <path d="M24 18 L24 82 L14 74 L14 10 Z" fill="url(#ez-side)" />

        {/* Light top facets */}
        <path d="M24 18 L80 18 L70 10 L14 10 Z" fill="url(#ez-top)" />
        <path d="M42 43 L72 43 L62 35 L32 35 Z" fill="url(#ez-top)" />
        <path d="M42 63 L80 63 L70 55 L32 55 Z" fill="url(#ez-top)" />

        {/* Bright front face */}
        <path
          d="M24 18 L80 18 L80 37 L42 37 L42 43 L72 43 L72 58 L42 58 L42 63 L80 63 L80 82 L24 82 Z"
          fill="url(#ez-front)"
        />
      </g>
    </svg>
  );
}

export function Logo({ className, showWordmark = true, glow = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative inline-flex size-9 items-center justify-center">
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
