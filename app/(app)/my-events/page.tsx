"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Plus, Ticket } from "lucide-react";
import { useAppStore } from "@/lib/store/use-app-store";
import { useSession } from "@/components/auth/use-session";
import { PageHeader } from "@/components/app/page-header";
import { EventCard } from "@/components/app/event-card";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { isUpcoming } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "hosting" | "attending" | "past";

export default function MyEventsPage() {
  const { userId } = useSession();
  const eventsMap = useAppStore((s) => s.events);
  const [tab, setTab] = React.useState<Tab>("hosting");

  const { hosting, attending, past, counts } = React.useMemo(() => {
    const all = Object.values(eventsMap).sort(
      (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)
    );
    const mine = all.filter(
      (e) => e.hostId === userId || e.attendeeIds.includes(userId ?? "")
    );
    const hosting = all.filter(
      (e) => e.hostId === userId && isUpcoming(e.startsAt)
    );
    const attending = all.filter(
      (e) =>
        e.hostId !== userId &&
        e.attendeeIds.includes(userId ?? "") &&
        isUpcoming(e.startsAt)
    );
    const past = mine
      .filter((e) => !isUpcoming(e.startsAt))
      .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return {
      hosting,
      attending,
      past,
      counts: {
        hosting: hosting.length,
        attending: attending.length,
        past: past.length,
      },
    };
  }, [eventsMap, userId]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "hosting", label: "Hosting", count: counts.hosting },
    { key: "attending", label: "Attending", count: counts.attending },
    { key: "past", label: "Past", count: counts.past },
  ];

  const list = tab === "hosting" ? hosting : tab === "attending" ? attending : past;

  return (
    <div>
      <PageHeader
        eyebrow="Your calendar"
        title="My Events"
        description="Events you're hosting and attending — past and upcoming."
        action={
          <Button asChild>
            <Link href="/create">
              <Plus className="size-4" />
              Create Event
            </Link>
          </Button>
        }
      />

      {/* Tabs */}
      <div className="mb-6 inline-flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-white/[0.08] text-white"
                : "text-muted-foreground hover:text-white"
            )}
          >
            {t.label}
            <span
              className={cn(
                "flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px]",
                tab === t.key
                  ? "bg-brand-purple text-white"
                  : "bg-white/10 text-muted-foreground"
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={tab === "past" ? CalendarClock : Ticket}
          title={
            tab === "hosting"
              ? "You're not hosting anything yet"
              : tab === "attending"
                ? "No upcoming events"
                : "No past events"
          }
          description={
            tab === "hosting"
              ? "Create your first event and it'll show up here."
              : tab === "attending"
                ? "RSVP to events to see them here."
                : "Events you've attended will be archived here."
          }
          action={
            tab !== "past" ? (
              <Button asChild>
                <Link href={tab === "hosting" ? "/create" : "/explore"}>
                  {tab === "hosting" ? (
                    <>
                      <Plus className="size-4" />
                      Create Event
                    </>
                  ) : (
                    "Explore events"
                  )}
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
