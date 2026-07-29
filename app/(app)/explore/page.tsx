"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarSearch, Plus, Search } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useEvents } from "@/lib/hooks/use-eventerz-data";
import { eventRowToItem } from "@/lib/supabase/map-event";
import { PageHeader } from "@/components/app/page-header";
import { EventCard } from "@/components/app/event-card";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "All",
  "Conference",
  "Meetup",
  "Hackathon",
  "Workshop",
  "Party",
  "AMA",
] as const;

export default function ExplorePage() {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>(
    "All"
  );
  const [upcomingOnly, setUpcomingOnly] = React.useState(true);

  /*
   * Filtering happens server-side so every client sees the same result set —
   * this list is now shared state, not one browser's local store.
   */
  const { data: rows = [], isLoading } = useEvents({
    upcomingOnly,
    category,
    query,
  });

  const events = React.useMemo(() => rows.map(eventRowToItem), [rows]);

  return (
    <div>
      <PageHeader
        eyebrow="Discover"
        title="Explore Events"
        description="Find conferences, hackathons and meetups across the Solana ecosystem."
        action={
          <Button asChild>
            <Link href="/create">
              <Plus className="size-4" />
              Create Event
            </Link>
          </Button>
        }
      />

      {/* Search + filters */}
      <div className="mb-6 space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events, locations, tags…"
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] pl-11 pr-4 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                category === c
                  ? "border-brand-purple/50 bg-brand-purple/15 text-white"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white"
              )}
            >
              {c}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <button
            onClick={() => setUpcomingOnly((v) => !v)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              upcomingOnly
                ? "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan"
                : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white"
            )}
          >
            {upcomingOnly ? "Upcoming only" : "All dates"}
          </button>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading events…
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarSearch}
          title="No events found"
          description="Try a different search or category — or create your own event."
          action={
            <Button asChild>
              <Link href="/create">
                <Plus className="size-4" />
                Create Event
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
