"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

interface RelativeMouse {
  x: number;
  y: number;
  /** Normalised (-0.5 → 0.5) coordinates, useful for tilt/parallax. */
  nx: number;
  ny: number;
}

/**
 * Tracks the mouse position relative to a referenced element.
 * Returns both raw (px) and normalised (-0.5 → 0.5) coordinates.
 */
export function useMousePosition<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  position: RelativeMouse;
  isHovering: boolean;
} {
  const ref = useRef<T>(null);
  const [position, setPosition] = useState<RelativeMouse>({
    x: 0,
    y: 0,
    nx: 0,
    ny: 0,
  });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setPosition({
        x,
        y,
        nx: x / rect.width - 0.5,
        ny: y / rect.height - 0.5,
      });
    };
    const handleEnter = () => setIsHovering(true);
    const handleLeave = () => setIsHovering(false);

    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseenter", handleEnter);
    el.addEventListener("mouseleave", handleLeave);

    return () => {
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseenter", handleEnter);
      el.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return { ref, position, isHovering };
}
