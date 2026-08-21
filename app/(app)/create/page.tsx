"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
import { queryKeys } from "@/lib/hooks/use-realtime";
import { useEventClaim } from "@/lib/solana/use-event-claim";
import {
  PRICE_CURRENCIES,
  formatPrice,
  sanitizeAmount,
  type PriceCurrency,
} from "@/lib/price";
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
    // The bare amount, never "0.5 SOL" - `priceCurrency` carries the unit and
    // `formatPrice` is the only thing that joins them. Empty means free.
    price: "",
    priceCurrency: "SOL" as PriceCurrency,
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

  /**
   * The host's on-chain claim, signed straight after the write.
   *
   * Free: the wallet is asked for a signature, not a payment. See
   * `lib/solana/event-claim.ts`.
   */
  const { claim, signing } = useEventClaim();
  const queryClient = useQueryClient();

  /*
   * Covers the write and the signature that follows it. The button must not go
   * idle between the two - the wallet popup is open during `signing`, and a
   * form that looks ready to submit again invites a second event.
   */
  const busy = createEvent.isPending || signing;

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
      price: formatPrice(form.price, form.priceCurrency),
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
     * Write first, then sign the on-chain claim.
     *
     * A $5 charge used to come first, and the pay-then-act ordering existed
     * because the reverse gave away a free event whenever payment failed. There
     * is nothing to pay now, so the ordering is decided by something else: the
     * claim's memo names `event.id`, which Postgres generates, so there is
     * nothing to sign until the insert has returned.
     *
     * That also decides what a closed wallet popup means. The event is already
     * live, so it stays live and simply carries no claim yet - and the host is
     * told exactly that, then sent to the event where they can sign it. The
     * alternative, treating an unsigned claim as a failed publish, would be a
     * lie that costs them the whole form and produces a duplicate event.
     */
    createEvent.mutate(input, {
      onSuccess: (event) => {
        void (async () => {
          /*
           * Never throws - every outcome is a result. See `useEventClaim`.
           *
           * The result is deliberately not surfaced here: this page unmounts on
           * the next line, so any message set on it would flash or never paint.
           * The event page renders the claim state from the database instead,
           * which is durable, correct on a reload, and the same thing the host
           * sees if they come back tomorrow.
           */
          await claim(event.id);

          /*
           * Invalidate *after* the claim, not before.
           *
           * `useCreateEvent` already invalidated `['events']` on success - but
           * that ran before this signature existed. Without this second call,
           * whether the event page opens showing the claim depends on whether
           * a refetch happened to be in flight during the wallet prompt, which
           * is a race that would pass every time in development and fail for
           * whoever signs slowly.
           */
          queryClient.invalidateQueries({ queryKey: queryKeys.event(event.id) });
          router.push(`/events/${event.id}`);
        })();
      },
      onError: (err) =>
        setError(
          err instanceof Error ? err.message : "Could not publish the event.",
        ),
    });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Host"
        title="Create Event"
        description="Set up your event, choose access rules and open it for RSVPs."
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
            {/*
              Amount and unit, matching the app's Access step. This was one
              free-text box hinting 'e.g. "Free" or "0.5 SOL"', which accepted
              "0.5 sol", ".5", "half a sol" and "5 dollars" equally and wrote
              all of them to the same shared `price` column - so a price set in
              a browser could not be read back reliably by anything, including
              the app that renders it.
            */}
            <Field label="Ticket price" hint="Leave empty for a free event">
              <div className="flex items-center gap-2">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) =>
                    set("price", sanitizeAmount(e.target.value))
                  }
                />
                <div
                  role="radiogroup"
                  aria-label="Ticket currency"
                  className="flex shrink-0 items-center gap-0.5 rounded-xl bg-white/5 p-0.5"
                >
                  {PRICE_CURRENCIES.map((currency) => (
                    <button
                      key={currency}
                      type="button"
                      role="radio"
                      aria-checked={form.priceCurrency === currency}
                      onClick={() => set("priceCurrency", currency)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        form.priceCurrency === currency
                          ? "bg-brand-purple text-white"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {currency}
                    </button>
                  ))}
                </div>
              </div>
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
            This used to disclose a one-off $5 charge. The charge is gone, but
            the wallet still opens - for a signature - so the disclosure stays
            and says which of the two it is. Dropping it entirely would leave a
            wallet popup appearing unannounced, which anyone who used this
            before will read as the fee they thought had been removed.
          */}
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground">Publishing is free.</span> Your
            wallet will ask you to sign a short message recording that you
            published this event - no fee is charged and no SOL is sent, only
            the Solana network fee. You can skip it and sign later.
          </p>

          <div className="flex gap-3">
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarPlus className="size-4" />
              )}
              {signing
                ? "Sign in your wallet..."
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
              {/* `formatPrice`, not `form.price` - the form holds the bare
                  amount, so this badge would otherwise preview "0.5" where the
                  published card reads "0.5 USDC". */}
              <span className="absolute bottom-3 right-3 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                {formatPrice(form.price, form.priceCurrency)}
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
