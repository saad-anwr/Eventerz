import type { Metadata } from "next";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site";
import { EventDetail } from "./event-detail";

/**
 * Server wrapper around the client event screen.
 *
 * It exists for one reason: `generateMetadata` cannot live in a `"use client"`
 * file, and this is the only route whose URL is routinely pasted into a chat.
 * Both apps' share sheets produce `/events/<id>`, so without per-event tags
 * every shared link previewed as the generic home page - same title, same
 * image, no date, no host. The most-shared page in the product was the one
 * carrying the least information about itself.
 *
 * The interactive screen is unchanged and still renders on the client; this
 * only adds a `<head>`.
 */

interface PageProps {
  // Next 15 hands params in as a promise.
  params: Promise<{ id: string }>;
}

/**
 * Read the event for its tags.
 *
 * Uses the anon client under RLS, exactly as the browser would, so this can
 * only ever describe an event the caller may already see. A private or
 * unreadable event falls through to the site defaults rather than leaking a
 * title through an OG tag - metadata is served to anyone who asks, including a
 * crawler with no session.
 */
async function loadEvent(id: string) {
  // A malformed id is a 404 in the UI; do not send it to Postgres, where a
  // non-uuid raises `22P02` rather than returning nothing.
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) return null;

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return null;

    const { data } = await supabase
      .from("events")
      .select(
        "id, title, description, starts_at, location, cover_image, cancelled_at",
      )
      .eq("id", id)
      .maybeSingle();

    return data;
  } catch {
    // Metadata must never break the page. A failed lookup means generic tags,
    // not a 500 on a URL someone has just shared.
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await loadEvent(id);

  if (!event) {
    return {
      title: "Event",
      description: siteConfig.description,
      alternates: { canonical: `/events/${id}` },
      // Nothing worth indexing when there is nothing to describe.
      robots: { index: false, follow: true },
    };
  }

  const when = event.starts_at
    ? new Date(event.starts_at).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const cancelled = Boolean(event.cancelled_at);
  const title = cancelled ? `${event.title} (cancelled)` : event.title;

  // Prefer the host's own words, and fall back to the facts we hold. An empty
  // description is worse than a plain one.
  const description = (
    event.description?.trim() ||
    [when, event.location].filter(Boolean).join(" · ") ||
    siteConfig.description
  ).slice(0, 200);

  const images = event.cover_image ? [{ url: event.cover_image }] : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/events/${id}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `${siteConfig.url}/events/${id}`,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images: event.cover_image ? [event.cover_image] : undefined,
    },
    // A cancelled event should still resolve for anyone holding the link, but
    // it is not something to surface in search.
    robots: cancelled ? { index: false, follow: true } : undefined,
  };
}

export default function EventDetailPage() {
  return <EventDetail />;
}
