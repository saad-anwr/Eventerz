"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  Globe,
  ImagePlus,
  Loader2,
  Lock,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";
import { useCreateEvent } from "@/lib/hooks/use-eventerz-data";
import { FeeCancelled, useFee } from "@/lib/solana/use-fee";
import { useSession } from "@/components/auth/use-session";
import { uploadEventBanner, type CreateEventInput } from "@/lib/supabase/data";
import type { EventCategory } from "@/lib/store/types";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import {
  LocationPicker,
  type PickedLocation,
} from "@/components/app/location-picker";
import { Button } from "@/components/ui/button";
import { formatEventDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  EVENT_CATEGORIES,
  Field,
  Toggle,
  inputCls,
} from "@/components/app/form-controls";

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

export default function CreateEventPage() {
  const router = useRouter();
  const { user } = useSession();
  const { userId } = useSession();
  const createEvent = useCreateEvent(userId ?? undefined);

  /** $5 in SOL, taken before the event is written. Free off mainnet. */
  const {
    pay: payCreateFee,
    paying: payingFee,
    label: feeLabel,
  } = useFee("createEvent");

  const [bannerUrl, setBannerUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(false);

  const handleBannerChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file still fires a change event.
    e.target.value = "";
    if (!file) return;

    if (!userId) {
      setError("Sign in before uploading a banner.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      setBannerUrl(await uploadEventBanner(file, userId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not upload that image."
      );
    } finally {
      setUploading(false);
    }
  };

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

  /*
   * The structured location lives beside the form rather than inside it: the
   * picker owns four fields that move together, and splitting them across the
   * flat form state means four places to forget one.
   */
  const [place, setPlace] = React.useState<PickedLocation>({ location: "" });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /*
   * Covers the fee step as well as the write. The wallet is open while the
   * charge waits to be approved, and a button that still looks idle invites a
   * second submit - which on a non-refundable charge is the expensive kind of
   * double-click.
   */
  const busy = payingFee || createEvent.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
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
      coverImage: bannerUrl || undefined,
      // Only carried for in-person events. An online event with coordinates
      // would render a map of a building nobody is going to.
      ...(form.isOnline
        ? {}
        : {
            latitude: place.latitude,
            longitude: place.longitude,
            placeId: place.placeId,
            address: place.address,
          }),
    };
    if (!userId) {
      return setError("Sign in before publishing an event.");
    }

    /*
     * The $5 fee is taken before the event is written, and it is
     * non-refundable. Publishing first would give away a free event whenever
     * the payment failed, and an event cannot be un-published once guests can
     * see it. The mobile app charges the same fee in the same order.
     */
    void (async () => {
      let paid = false;
      try {
        paid = (await payCreateFee()) !== null;
      } catch (err) {
        if (err instanceof FeeCancelled) return;
        return setError(
          err instanceof Error
            ? err.message
            : "Could not take the creation fee.",
        );
      }

      // Publishing writes to Supabase, so the event is visible to everyone -
      // previously it only ever reached this browser's local store.
      createEvent.mutate(input, {
        onSuccess: (event) => router.push(`/events/${event.id}`),
        onError: (err) =>
          setError(
            paid
              ? // Money moved and no event exists. "Try again" would invite a
                // second $5 charge for the same event.
                "Your fee was taken but the event was not created. Contact support with your wallet address - do not pay again."
              : err instanceof Error
                ? err.message
                : "Could not publish the event.",
          ),
      });
    })();
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
              {EVENT_CATEGORIES.map((c) => (
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
              <LocationPicker
                value={place}
                onChange={(next) => {
                  setPlace(next);
                  set("location", next.location);
                }}
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

          <Field label="Banner image">
            {bannerUrl ? (
              <div className="group relative overflow-hidden rounded-2xl border border-white/10">
                {/* Plain <img>: the URL is a runtime Supabase host, so
                    next/image would need it whitelisted in next.config. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bannerUrl}
                  alt="Event banner preview"
                  className="h-40 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setBannerUrl("")}
                  className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/90"
                >
                  <X className="size-3.5" />
                  Remove
                </button>
              </div>
            ) : (
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center transition-colors hover:border-brand-purple/40 hover:bg-white/[0.04]",
                  uploading && "pointer-events-none opacity-60"
                )}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={handleBannerChange}
                  disabled={uploading}
                />
                {uploading ? (
                  <Loader2 className="size-5 animate-spin text-brand-purple" />
                ) : (
                  <ImagePlus className="size-5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium text-white">
                  {uploading ? "Uploading..." : "Upload a banner"}
                </span>
                <span className="text-xs text-muted-foreground">
                  JPEG, PNG, WebP or AVIF · up to 5 MB · 16:9 looks best
                </span>
              </label>
            )}
          </Field>

          <Field
            label={bannerUrl ? "Fallback colour" : "Cover colour"}
            hint={
              bannerUrl
                ? "Used on small cards and while the image loads."
                : undefined
            }
          >
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

          {/*
            State the price before the button, not inside the wallet popup. A
            non-refundable charge should never be the first thing someone learns
            about their event from a signature request.
          */}
          {feeLabel && (
            <p className="text-xs text-muted-foreground">
              Publishing costs a one-off{" "}
              <span className="text-foreground">{feeLabel}</span>, charged from
              your connected wallet. This fee is not refundable.
            </p>
          )}

          <div className="flex gap-3">
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarPlus className="size-4" />
              )}
              {payingFee
                ? "Confirm in your wallet..."
                : createEvent.isPending
                  ? "Publishing..."
                  : "Publish Event"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="ghost"
              disabled={busy}
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
            <div
              className={cn(
                "relative h-36 overflow-hidden bg-gradient-to-br",
                form.coverGradient
              )}
            >
              {bannerUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={bannerUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
              )}
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
                  <Avatar name={user.name} seed={user.id} size="xs" src={user.avatarUrl} />
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
