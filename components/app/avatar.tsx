"use client";

import * as React from "react";

import { avatarGradient, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

const sizes = {
  xs: "size-6 text-[9px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
};

interface AvatarProps {
  name: string;
  seed?: string;
  size?: keyof typeof sizes;
  className?: string;
  ring?: boolean;
  /** Uploaded picture. The gradient shows until it loads, and again if it fails. */
  src?: string | null;
}

/**
 * Gradient avatar with initials, optionally covered by an uploaded picture.
 *
 * The image is layered *over* the gradient rather than replacing it, so one
 * element serves as placeholder, fallback and final state: a slow image shows
 * initials instead of a blank circle, and a broken URL - a deleted object, a
 * storage outage - degrades to those same initials instead of the browser's
 * broken-image glyph.
 */
export function Avatar({
  name,
  seed,
  size = "md",
  className,
  ring,
  src,
}: AvatarProps) {
  // Reset when `src` changes, so replacing a broken picture with a good one
  // recovers rather than staying on the fallback for the component's lifetime.
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-semibold text-white",
        avatarGradient(seed ?? name),
        sizes[size],
        ring && "ring-2 ring-white/15",
        className
      )}
      aria-hidden
    >
      {initials(name)}
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
