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
}

/** Deterministic gradient avatar with initials. */
export function Avatar({
  name,
  seed,
  size = "md",
  className,
  ring,
}: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white",
        avatarGradient(seed ?? name),
        sizes[size],
        ring && "ring-2 ring-white/15",
        className
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
