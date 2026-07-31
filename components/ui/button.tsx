"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold ring-offset-brand-bg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple/70 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none overflow-hidden active:scale-[0.97]",
  {
    variants: {
      variant: {
        // Primary - Solana gradient with hover shine + glow
        primary:
          "text-white shadow-glow bg-brand-gradient bg-[length:200%_auto] hover:bg-[position:100%_0] hover:shadow-[0_0_50px_-6px_rgba(153,69,255,0.7)] hover:-translate-y-0.5",
        // Secondary - glass
        secondary:
          "glass text-white hover:bg-white/[0.08] hover:border-white/20 hover:-translate-y-0.5",
        // Outline - gradient border look
        outline:
          "border border-white/15 bg-white/[0.02] text-white hover:border-brand-purple/50 hover:bg-white/[0.05] hover:-translate-y-0.5",
        ghost: "text-muted-foreground hover:text-white hover:bg-white/[0.05]",
        link: "text-brand-cyan underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 px-4 text-[13px]",
        lg: "h-13 px-8 text-base h-[52px]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

interface Ripple {
  key: number;
  x: number;
  y: number;
  size: number;
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, onClick, ...props }, ref) => {
    const [ripples, setRipples] = React.useState<Ripple[]>([]);

    if (asChild) {
      // Slot requires a single child - no ripple layer for link-style usage.
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref as React.Ref<HTMLElement>}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const next: Ripple = {
        key: rect.left + e.clientX + e.clientY,
        x: e.clientX - rect.left - size / 2,
        y: e.clientY - rect.top - size / 2,
        size,
      };
      setRipples((prev) => [...prev, next]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.key !== next.key));
      }, 650);
      onClick?.(e);
    };

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      >
        <span className="relative z-[1] inline-flex items-center gap-2">
          {children}
        </span>
        {/* Ripple layer */}
        {ripples.map((r) => (
          <span
            key={r.key}
            className="pointer-events-none absolute z-0 animate-[ripple_0.65s_ease-out] rounded-full bg-white/30"
            style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
          />
        ))}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
