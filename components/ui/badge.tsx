import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-white/10 bg-white/[0.05] text-muted-foreground",
        purple: "border-brand-purple/30 bg-brand-purple/10 text-brand-purple",
        blue: "border-brand-blue/30 bg-brand-blue/10 text-brand-blue",
        cyan: "border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan",
        green: "border-brand-green/30 bg-brand-green/10 text-brand-green",
        live: "border-brand-green/40 bg-brand-green/10 text-brand-green",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
