/** Small, dependency-free formatting helpers for the app. */

/** Stable unique id (browser + node 19+). */
export function uid(prefix = ""): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${id}` : id;
}

/** "just now" · "4m" · "2h" · "3d" · "12 Aug" — compact relative time. */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

/** Chat timestamp — "6:42 PM". */
export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Full timestamp for hover/labels — "14 Aug 2026, 6:42 PM". */
export function fullTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Day separator label for chat — "Today" · "Yesterday" · "Thu, 14 Aug". */
export function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Event date — "Thu, Aug 14 · 6:00 PM". */
export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Short event date parts — { month: "AUG", day: "14" }. */
export function eventDateParts(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
  };
}

/** Is the event in the future? */
export function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}

/**
 * ISO instant → the `YYYY-MM-DDTHH:mm` an `<input type="datetime-local">`
 * expects, in the viewer's own timezone.
 *
 * `toISOString().slice(0, 16)` is the obvious version and it is wrong: it
 * returns UTC, so an edit form in Delhi opens showing a start time five and a
 * half hours earlier than the one on the page behind it. Saving without
 * touching the field then moves the event.
 */
export function toDateTimeLocal(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Truncate a wallet address — "9xQe…4dRt". */
export function shortenAddress(address?: string | null): string {
  if (!address) return "";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
