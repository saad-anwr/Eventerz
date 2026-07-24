import { cn } from "@/lib/utils";

interface GradientBlobProps {
  className?: string;
  color?: "purple" | "blue" | "cyan" | "green" | "mixed";
  size?: number;
  animate?: boolean;
}

const colorMap: Record<NonNullable<GradientBlobProps["color"]>, string> = {
  purple: "from-brand-purple/50 to-brand-violet/10",
  blue: "from-brand-blue/50 to-brand-blue/5",
  cyan: "from-brand-cyan/40 to-brand-cyan/5",
  green: "from-brand-green/40 to-brand-green/5",
  mixed: "from-brand-purple/40 via-brand-blue/30 to-brand-cyan/20",
};

/**
 * A soft, blurred gradient "blob" used to light sections from behind.
 * Purely decorative (aria-hidden, non-interactive).
 */
export function GradientBlob({
  className,
  color = "purple",
  size = 500,
  animate = true,
}: GradientBlobProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute -z-10 rounded-full bg-gradient-to-br opacity-60 blur-[100px]",
        colorMap[color],
        animate && "animate-pulse-glow",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
