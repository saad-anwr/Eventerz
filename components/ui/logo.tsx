import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
}

/**
 * Eventerz brand mark — a gradient "E" glyph built from stacked bars.
 */
export function Logo({ className, showWordmark = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative inline-flex size-8 items-center justify-center">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          className="size-8"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="eventerz-mark" x1="0" y1="0" x2="32" y2="32">
              <stop stopColor="#9945FF" />
              <stop offset="0.5" stopColor="#2F80FF" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
          <rect
            width="32"
            height="32"
            rx="9"
            fill="url(#eventerz-mark)"
            fillOpacity="0.16"
          />
          <rect
            x="0.75"
            y="0.75"
            width="30.5"
            height="30.5"
            rx="8.25"
            stroke="url(#eventerz-mark)"
            strokeOpacity="0.5"
            strokeWidth="1.5"
          />
          <path
            d="M10 9.5C10 8.67 10.67 8 11.5 8H22V11H13V14.5H20.5V17.5H13V21H22V24H11.5C10.67 24 10 23.33 10 22.5V9.5Z"
            fill="url(#eventerz-mark)"
          />
        </svg>
        <span className="absolute inset-0 -z-10 rounded-[9px] bg-brand-purple/40 blur-md" />
      </span>
      {showWordmark && (
        <span className="font-display text-lg font-semibold tracking-tight text-white">
          Eventerz
        </span>
      )}
    </span>
  );
}
