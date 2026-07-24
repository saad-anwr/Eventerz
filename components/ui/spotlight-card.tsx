"use client";

import * as React from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Enable 3D tilt toward the cursor. */
  tilt?: boolean;
  /** Max tilt in degrees. */
  tiltAmount?: number;
  /** Radial spotlight glow color (rgba). */
  glowColor?: string;
  spotlightSize?: number;
  as?: React.ElementType;
}

/**
 * Premium interactive card:
 *  - a radial "spotlight" that tracks the cursor,
 *  - optional subtle 3D tilt,
 *  - a soft lift on hover.
 * Falls back gracefully (no JS effects) on touch / reduced-motion.
 */
export function SpotlightCard({
  children,
  className,
  tilt = false,
  tiltAmount = 6,
  glowColor = "rgba(153,69,255,0.15)",
  spotlightSize = 350,
  ...props
}: SpotlightCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(0, { stiffness: 150, damping: 18 });
  const rotateY = useSpring(0, { stiffness: 150, damping: 18 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseX.set(x);
    mouseY.set(y);

    if (tilt) {
      const px = x / rect.width - 0.5;
      const py = y / rect.height - 0.5;
      rotateY.set(px * tiltAmount);
      rotateX.set(-py * tiltAmount);
    }
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  const background = useMotionTemplate`radial-gradient(${spotlightSize}px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 80%)`;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={
        tilt
          ? {
              rotateX,
              rotateY,
              transformStyle: "preserve-3d",
              transformPerspective: 1000,
            }
          : undefined
      }
      className={cn(
        "group/spotlight relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-colors duration-300 hover:border-white/20",
        className
      )}
      {...(props as React.ComponentProps<typeof motion.div>)}
    >
      {/* Spotlight glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/spotlight:opacity-100"
        style={{ background }}
      />
      {/* Top inner highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />
      <div className="relative z-[1] h-full" style={tilt ? { transform: "translateZ(40px)" } : undefined}>
        {children}
      </div>
    </motion.div>
  );
}
