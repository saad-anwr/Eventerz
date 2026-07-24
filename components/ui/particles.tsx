"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ParticlesProps {
  className?: string;
  quantity?: number;
  color?: string;
}

interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  tw: number; // twinkle phase
}

/**
 * Subtle, performant canvas particle field. Dots drift slowly and gently
 * drift toward the cursor. Respects prefers-reduced-motion (renders a static
 * field) and cleans up its RAF loop on unmount.
 */
export function Particles({
  className,
  quantity = 56,
  color = "153,69,255",
}: ParticlesProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rafRef = React.useRef<number | null>(null);
  const dotsRef = React.useRef<Dot[]>([]);
  const mouseRef = React.useRef({ x: -9999, y: -9999 });
  const sizeRef = React.useRef({ w: 0, h: 0, dpr: 1 });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const init = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? window.innerWidth;
      const h = parent?.clientHeight ?? window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w, h, dpr };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(
        quantity,
        Math.floor((w * h) / 26000) // scale down on small screens
      );
      dotsRef.current = Array.from({ length: Math.max(18, count) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.6 + 0.5,
        alpha: Math.random() * 0.5 + 0.2,
        tw: Math.random() * Math.PI * 2,
      }));
    };

    const draw = () => {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);
      const dots = dotsRef.current;
      const m = mouseRef.current;

      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        d.tw += 0.02;

        // gentle attraction toward cursor
        const dx = m.x - d.x;
        const dy = m.y - d.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 22000 && dist2 > 0.001) {
          const f = 0.4 / Math.sqrt(dist2);
          d.vx += dx * f * 0.02;
          d.vy += dy * f * 0.02;
        }
        // friction + speed clamp
        d.vx *= 0.99;
        d.vy *= 0.99;

        // wrap around edges
        if (d.x < -10) d.x = w + 10;
        if (d.x > w + 10) d.x = -10;
        if (d.y < -10) d.y = h + 10;
        if (d.y > h + 10) d.y = -10;

        const a = d.alpha * (0.6 + 0.4 * Math.sin(d.tw));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${a})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const drawStatic = () => {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);
      for (const d of dotsRef.current) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${d.alpha})`;
        ctx.fill();
      }
    };

    const onResize = () => {
      init();
      if (reduced) drawStatic();
    };
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    init();
    if (reduced) {
      drawStatic();
    } else {
      rafRef.current = requestAnimationFrame(draw);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseleave", onLeave);
    }
    window.addEventListener("resize", onResize);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [quantity, color]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
