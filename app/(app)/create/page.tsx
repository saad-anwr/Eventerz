"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Globe, Lock, MapPin, Sparkles } from "lucide-react";
import { useAppStore, type CreateEventInput } from "@/lib/store/use-app-store";
import { useSession } from "@/components/auth/use-session";
import type { EventCategory } from "@/lib/store/types";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import { Button } from "@/components/ui/button";
import { formatEventDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const CATEGORIES: EventCategory[] = [
  "Conference",
  "Meetup",
  "Hackathon",
  "Workshop",
  "Party",
  "AMA",
  "Concert",
  "Other",
];

const GRADIENTS = [
  "from-brand-purple to-brand-blue",
  "from-brand-blue to-brand-cyan",
  "from-brand-cyan to-brand-green",
  "from-brand-violet to-brand-purple",
  "from-fuchsia-500 to-brand-purple",
  "from-indigo-500 to-brand-blue",
  "from-brand-green to-brand-cyan",
  "from-rose-500 to-brand-violet",
];

function Field({
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
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none";

function Toggle({
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

export default function CreateEventPage() {
  const router = useRouter();
  const { user } = useSession();
  const createEvent = useAppStore((s) => s.createEvent);

  const [form, setForm] = React.useState({
    title: "",
    description: "",
    category: "Meetup" as EventCategory,
    startsAt: "",
    endsAt: "",
    location: "",
    isOnline: false,
    capacity: "100",
    price: "Free",
    visibility: "public" as "public" | "private",
    requiresApproval: false,
    tokenGated: false,
    tags: "",
    coverGradient: GRADIENTS[0],
  });
  const [error, setError] = React.useState("");

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Give your event a title.");
    if (!form.startsAt) return setError("Pick a start date & time.");
    if (!form.isOnline && !form.location.trim())
      return setError("Add a location (or mark it online).");

    const input: CreateEventInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      location: form.isOnline ? "Online" : form.location.trim(),
      isOnline: form.isOnline,
      capacity: Math.max(1, parseInt(form.capacity) || 100),
      price: form.price.trim() || "Free",
      visibility: form.visibility,
      requiresApproval: form.requiresApproval,
      tokenGated: form.tokenGated,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      coverGradient: form.coverGradient,
    };
    const event = createEvent(input);
    router.push(`/events/${event.id}`);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Host"
        title="Create Event"
        description="Set up your event, choose access rules and publish it on-chain."
      />

      <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        {/* Form */}
        <div className="space-y-5">
          <Field label="Event title">
            <input
              className={inputCls}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Solana Builders Meetup"
            />
          </Field>

          <Field label="Description">
            <textarea
              rows={4}
              className={cn(inputCls, "h-auto py-3 leading-relaxed")}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What's your event about? Who should come?"
            />
          </Field>

          <Field label="Category">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("category", c)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    form.category === c
                      ? "border-brand-purple/50 bg-brand-purple/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Starts">
              <input
                type="datetime-local"
                className={cn(inputCls, "[color-scheme:dark]")}
                value={form.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
              />
            </Field>
            <Field label="Ends (optional)">
              <input
                type="datetime-local"
                className={cn(inputCls, "[color-scheme:dark]")}
                value={form.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
              />
            </Field>
          </div>

          <Toggle
            checked={form.isOnline}
            onChange={(v) => set("isOnline", v)}
            label="This is an online event"
            icon={Globe}
          />

          {!form.isOnline && (
            <Field label="Location">
              <input
                className={inputCls}
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="City, venue or address"
              />
            </Field>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Capacity">
              <input
                type="number"
                min={1}
                className={inputCls}
                value={form.capacity}
                onChange={(e) => set("capacity", e.target.value)}
              />
            </Field>
            <Field label="Price" hint='e.g. "Free" or "0.5 SOL"'>
              <input
                className={inputCls}
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Tags" hint="Comma-separated">
            <input
              className={inputCls}
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="Networking, DeFi, Beginner-friendly"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              checked={form.visibility === "private"}
              onChange={(v) => set("visibility", v ? "private" : "public")}
              label="Private (invite only)"
              icon={Lock}
            />
            <Toggle
              checked={form.requiresApproval}
              onChange={(v) => set("requiresApproval", v)}
              label="Require approval"
              icon={Sparkles}
            />
            <Toggle
              checked={form.tokenGated}
              onChange={(v) => set("tokenGated", v)}
              label="Token-gated access"
              icon={Lock}
            />
          </div>

          <Field label="Cover">
            <div className="flex flex-wrap gap-2">
              {GRADIENTS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set("coverGradient", g)}
                  className={cn(
                    "size-9 rounded-xl bg-gradient-to-br ring-2 ring-offset-2 ring-offset-brand-bg transition-all",
                    g,
                    form.coverGradient === g ? "ring-white/70" : "ring-transparent"
                  )}
                  aria-label="Pick cover color"
                />
              ))}
            </div>
          </Field>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button type="submit" size="lg">
              <CalendarPlus className="size-4" />
              Publish Event
            </Button>
            <Button
              type="button"
              size="lg"
              variant="ghost"
              onClick={() => router.push("/explore")}
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Preview
          </p>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
            <div className={cn("relative h-36 bg-gradient-to-br", form.coverGradient)}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.35),transparent_55%)]" />
              <span className="absolute left-3 top-3 rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                {form.category}
              </span>
              <span className="absolute bottom-3 right-3 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                {form.price || "Free"}
              </span>
            </div>
            <div className="p-4">
              <p className="text-xs text-brand-cyan">
                {form.startsAt
                  ? formatEventDate(new Date(form.startsAt).toISOString())
                  : "Date & time"}
              </p>
              <h3 className="mt-1 font-display text-base font-semibold text-white">
                {form.title || "Your event title"}
              </h3>
              {user && (
                <div className="mt-3 flex items-center gap-2">
                  <Avatar name={user.name} seed={user.id} size="xs" />
                  <span className="text-xs text-muted-foreground">
                    Hosted by {user.name}
                  </span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                {form.isOnline ? (
                  <Globe className="size-3.5" />
                ) : (
                  <MapPin className="size-3.5" />
                )}
                {form.isOnline ? "Online" : form.location || "Location"}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
