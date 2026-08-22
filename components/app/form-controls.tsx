"use client";

/**
 * The form primitives the create and edit event pages share.
 *
 * They were copy-pasted between the two pages, which is how the two forms ended
 * up looking subtly different: a class tweaked on one screen never reached the
 * other. Both now render the same controls, so the create form and the edit
 * form stay identical by construction.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { EventCategory } from "@/lib/store/types";

/** Shared `<input>` / `<select>` styling. */
export const inputCls =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none";

/** Every category an event can be filed under, in the order the forms list them. */
export const EVENT_CATEGORIES: EventCategory[] = [
  "Conference",
  "Meetup",
  "Hackathon",
  "Workshop",
  "Party",
  "AMA",
  "Concert",
  "Other",
];

/** A labelled form row, with an optional hint below the control. */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

/** The category chips. Both event forms list the same set, in the same order. */
export function CategoryPicker({
  value,
  onChange,
}: {
  value: EventCategory;
  onChange: (c: EventCategory) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {EVENT_CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            value === c
              ? "border-brand-purple/50 bg-brand-purple/15 text-white"
              : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** An on/off row with a leading icon and a switch on the right. */
export function Toggle({
  checked,
  onChange,
  label,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors",
        checked
          ? "border-brand-purple/40 bg-brand-purple/10 text-white"
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white"
      )}
    >
      <Icon className={cn("size-4", checked && "text-brand-purple")} />
      <span className="flex-1">{label}</span>
      <span
        className={cn(
          "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-brand-purple" : "bg-white/15"
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4"
          )}
        />
      </span>
    </button>
  );
}
