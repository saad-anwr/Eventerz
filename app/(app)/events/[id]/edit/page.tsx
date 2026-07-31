"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Globe,
  Loader2,
  Lock,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  useCancelEvent,
  useEvent,
  useUpdateEvent,
} from "@/lib/hooks/use-eventerz-data";
import { eventRowToItem } from "@/lib/supabase/map-event";
import { useSession } from "@/components/auth/use-session";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import {
  LocationPicker,
  type PickedLocation,
} from "@/components/app/location-picker";
import { Button } from "@/components/ui/button";
import type { UpdateEventInput } from "@/lib/supabase/data";
import type { EventCategory, EventItem } from "@/lib/store/types";
import { goingCount, hasEnded, isCancelled } from "@/lib/events";
import { toDateTimeLocal } from "@/lib/format";
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

const inputCls =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none";

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
      <span className="mb-1.5 block text-sm font-medium text-white">{label}</span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

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
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white",
      )}
    >
      <Icon className={cn("size-4", checked && "text-brand-purple")} />
      <span className="flex-1">{label}</span>
      <span
        className={cn(
          "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-brand-purple" : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}

/** The editable shape, as strings - what the form fields actually hold. */
interface Draft {
  title: string;
  description: string;
  category: EventCategory;
  startsAt: string;
  endsAt: string;
  isOnline: boolean;
  capacity: string;
  price: string;
  visibility: "public" | "private";
  requiresApproval: boolean;
  tags: string;
}

function draftFrom(event: EventItem): Draft {
  return {
    title: event.title,
    description: event.description,
    category: event.category,
    startsAt: toDateTimeLocal(event.startsAt),
    endsAt: toDateTimeLocal(event.endsAt),
    isOnline: event.isOnline,
    capacity: String(event.capacity),
    price: event.price,
    visibility: event.visibility,
    requiresApproval: event.requiresApproval,
    tags: event.tags.join(", "),
  };
}

export default function EditEventPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const router = useRouter();
  const { userId } = useSession();

  const { data: row, isLoading } = useEvent(eventId);
  const event = React.useMemo(() => (row ? eventRowToItem(row) : null), [row]);

  const update = useUpdateEvent(eventId);
  const cancel = useCancelEvent(eventId);

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [place, setPlace] = React.useState<PickedLocation | null>(null);
  const [error, setError] = React.useState("");
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");

  /*
   * Seed the form once, from the first load. Re-seeding on every refetch would
   * throw away whatever the host was typing the moment a Realtime event landed
   * - and this page is subscribed to the very table it is editing, so that
   * happens constantly.
   */
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (!event || seeded.current) return;
    seeded.current = true;
    setDraft(draftFrom(event));
    setPlace({
      location: event.location,
      latitude: event.latitude,
      longitude: event.longitude,
      placeId: event.placeId,
      address: event.address,
    });
  }, [event]);

  if (isLoading || (event && !draft)) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading event...
      </div>
    );
  }

  if (!event) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Event not found"
        description="This event may have been removed or the link is incorrect."
        action={
          <Button asChild>
            <Link href="/my-events">Your events</Link>
          </Button>
        }
      />
    );
  }

  if (event.hostId !== userId) {
    return (
      <EmptyState
        icon={Lock}
        title="Only the host can edit this event"
        description="Ask the organiser to make the change."
        action={
          <Button asChild>
            <Link href={`/events/${eventId}`}>Back to the event</Link>
          </Button>
        }
      />
    );
  }

  if (isCancelled(event)) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="This event was cancelled"
        description="A cancelled event cannot be edited. Create a new one instead."
        action={
          <Button asChild>
            <Link href="/create">Create an event</Link>
          </Button>
        }
      />
    );
  }

  const going = goingCount(event);
  const ended = hasEnded(event);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  /**
   * Only what actually changed.
   *
   * The RPC treats an omitted field as "leave alone", which is what makes two
   * devices editing the same event safe - sending the whole row back would
   * overwrite the other device's change with a value this form never touched.
   */
  const buildPatch = (current: Draft, original: EventItem): UpdateEventInput => {
    const patch: UpdateEventInput = {};

    if (current.title.trim() !== original.title) patch.title = current.title.trim();
    if (current.description.trim() !== original.description) {
      patch.description = current.description.trim();
    }
    if (current.category !== original.category) patch.category = current.category;

    const startsIso = current.startsAt
      ? new Date(current.startsAt).toISOString()
      : "";
    if (startsIso && startsIso !== original.startsAt) patch.startsAt = startsIso;

    const endsIso = current.endsAt ? new Date(current.endsAt).toISOString() : "";
    if (endsIso !== (original.endsAt ?? "")) {
      // Null is "clear it", which the data layer turns into `p_clear_ends_at`.
      patch.endsAt = endsIso || null;
    }

    if (current.isOnline !== original.isOnline) patch.isOnline = current.isOnline;

    const nextLocation = current.isOnline
      ? "Online"
      : (place?.location ?? "").trim();
    if (nextLocation && nextLocation !== original.location) {
      patch.location = nextLocation;
    }

    // Coordinates travel with the location. An online event drops them, since
    // a map of an online event is a map of nowhere.
    if (current.isOnline) {
      if (original.latitude !== undefined) {
        patch.latitude = null;
        patch.longitude = null;
        patch.placeId = null;
        patch.address = null;
      }
    } else if (place?.latitude !== original.latitude) {
      patch.latitude = place?.latitude ?? null;
      patch.longitude = place?.longitude ?? null;
      patch.placeId = place?.placeId ?? null;
      patch.address = place?.address ?? null;
    }

    const capacity = Math.max(1, Number.parseInt(current.capacity, 10) || 1);
    if (capacity !== original.capacity) patch.capacity = capacity;

    if (current.price.trim() !== original.price) patch.price = current.price.trim();
    if (current.visibility !== original.visibility) {
      patch.visibility = current.visibility;
    }
    if (current.requiresApproval !== original.requiresApproval) {
      patch.requiresApproval = current.requiresApproval;
    }

    const tags = current.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.join(",") !== original.tags.join(",")) patch.tags = tags;

    return patch;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError("");

    if (!draft.title.trim()) return setError("Give your event a title.");
    if (!draft.startsAt) return setError("Pick a start date & time.");
    if (!draft.isOnline && !(place?.location ?? "").trim()) {
      return setError("Add a location (or mark it online).");
    }

    const capacity = Math.max(1, Number.parseInt(draft.capacity, 10) || 1);
    if (capacity < going) {
      return setError(
        `You already have ${going} confirmed guests. Remove some before lowering capacity to ${capacity}.`,
      );
    }

    const patch = buildPatch(draft, event);
    if (Object.keys(patch).length === 0) {
      router.push(`/events/${eventId}`);
      return;
    }

    update.mutate(patch, {
      onSuccess: () => router.push(`/events/${eventId}`),
      onError: (err) =>
        setError(
          err instanceof Error ? err.message : "Could not save your changes.",
        ),
    });
  };

  const confirmCancel = () => {
    setError("");
    cancel.mutate(cancelReason || undefined, {
      onSuccess: () => router.push(`/events/${eventId}`),
      onError: (err) =>
        setError(
          err instanceof Error ? err.message : "Could not cancel the event.",
        ),
    });
  };

  if (!draft || !place) return null;

  return (
    <div>
      <Link
        href={`/events/${eventId}`}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-white"
      >
        <ArrowLeft className="size-4" />
        Back to the event
      </Link>

      <PageHeader
        eyebrow="Host"
        title="Edit event"
        description="Guests are notified automatically when the time or place changes."
      />

      {ended && (
        <p className="mb-6 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          This event has already ended. Edits are saved but will not notify
          anyone.
        </p>
      )}

      <form onSubmit={submit} className="max-w-2xl space-y-5">
        <Field label="Event title">
          <input
            className={inputCls}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>

        <Field label="Description">
          <textarea
            rows={4}
            className={cn(inputCls, "h-auto py-3 leading-relaxed")}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
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
                  draft.category === c
                    ? "border-brand-purple/50 bg-brand-purple/15 text-white"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Starts" hint="Changing this notifies every live guest.">
            <input
              type="datetime-local"
              className={cn(inputCls, "[color-scheme:dark]")}
              value={draft.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
            />
          </Field>
          <Field label="Ends (optional)">
            <input
              type="datetime-local"
              className={cn(inputCls, "[color-scheme:dark]")}
              value={draft.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
            />
          </Field>
        </div>

        <Toggle
          checked={draft.isOnline}
          onChange={(v) => set("isOnline", v)}
          label="This is an online event"
          icon={Globe}
        />

        {!draft.isOnline && (
          <Field label="Location" hint="Changing this notifies every live guest.">
            <LocationPicker value={place} onChange={setPlace} />
          </Field>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Capacity"
            hint={going > 0 ? `${going} confirmed - cannot go below this.` : undefined}
          >
            <input
              type="number"
              min={Math.max(1, going)}
              className={inputCls}
              value={draft.capacity}
              onChange={(e) => set("capacity", e.target.value)}
            />
          </Field>
          <Field label="Price" hint='e.g. "Free" or "0.5 SOL"'>
            <input
              className={inputCls}
              value={draft.price}
              onChange={(e) => set("price", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Tags" hint="Comma-separated">
          <input
            className={inputCls}
            value={draft.tags}
            onChange={(e) => set("tags", e.target.value)}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={draft.visibility === "private"}
            onChange={(v) => set("visibility", v ? "private" : "public")}
            label="Private (invite only)"
            icon={Lock}
          />
          <Toggle
            checked={draft.requiresApproval}
            onChange={(v) => set("requiresApproval", v)}
            label="Require approval"
            icon={Sparkles}
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" size="lg" disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {update.isPending ? "Saving..." : "Save changes"}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="ghost"
            onClick={() => router.push(`/events/${eventId}`)}
          >
            Discard
          </Button>
        </div>
      </form>

      {/* Cancellation, deliberately separated from the save flow. */}
      <div className="mt-10 max-w-2xl rounded-3xl border border-red-500/20 bg-red-500/[0.04] p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
          <AlertTriangle className="size-4 text-red-400" />
          Cancel this event
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Everyone holding a spot is notified and their RSVP is closed. The event
          page stays up so ticket holders keep the record - it cannot be
          un-cancelled.
        </p>

        {confirmingCancel ? (
          <div className="mt-4 space-y-3">
            <Field label="Why? (optional)" hint="Included in the notification guests receive.">
              <input
                className={inputCls}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Venue fell through - we'll reschedule."
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                disabled={cancel.isPending}
                onClick={confirmCancel}
              >
                {cancel.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {cancel.isPending
                  ? "Cancelling..."
                  : going > 0
                    ? `Yes, cancel and notify ${going} ${going === 1 ? "guest" : "guests"}`
                    : "Yes, cancel this event"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmingCancel(false)}
              >
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-4 border-red-500/40 text-red-300 hover:bg-red-500/10"
            onClick={() => setConfirmingCancel(true)}
          >
            <Trash2 className="size-4" />
            Cancel event
          </Button>
        )}
      </div>
    </div>
  );
}
