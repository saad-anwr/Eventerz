"use client";

/**
 * The parts of a profile that `/profile` and `/u/[id]` both render.
 *
 * The two pages show the same person - one to themselves, one to a visitor -
 * and had grown byte-identical copies of About, Interests, Hosting and the
 * details list. A class tweaked on your own profile never reached the public
 * one, so the two drifted. They now share these, and only genuinely different
 * things (your email and phone, their holdings) stay on their own page.
 */

import * as React from "react";
import { Ticket } from "lucide-react";
import { EventCard } from "@/components/app/event-card";
import type { EventItem } from "@/lib/store/types";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 font-display text-lg font-semibold text-white">
      {children}
    </h2>
  );
}

export function ProfileAbout({ bio }: { bio?: string }) {
  if (!bio) return null;
  return (
    <section>
      <SectionTitle>About</SectionTitle>
      <p className="text-sm leading-relaxed text-muted-foreground">{bio}</p>
    </section>
  );
}

export function ProfileInterests({ interests }: { interests: string[] }) {
  if (interests.length === 0) return null;
  return (
    <section>
      <SectionTitle>Interests</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {interests.map((t) => (
          <span
            key={t}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground"
          >
            {t}
          </span>
        ))}
      </div>
    </section>
  );
}

/** The first four events this person hosts. `empty` is what a visitor is told. */
export function ProfileHosting({
  events,
  empty,
}: {
  events: EventItem[];
  empty: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Ticket className="size-5 text-brand-purple" />
        <h2 className="font-display text-lg font-semibold text-white">
          Hosting ({events.length})
        </h2>
      </div>
      {events.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.slice(0, 4).map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/** One row of the details card: a leading icon and whatever it labels. */
export function DetailRow({
  icon: Icon,
  tone = "muted",
  children,
}: {
  icon: React.ElementType;
  tone?: "muted" | "green";
  children: React.ReactNode;
}) {
  return (
    <li
      className={
        tone === "green"
          ? "flex items-center gap-2.5 text-brand-green"
          : "flex items-center gap-2.5 text-muted-foreground"
      }
    >
      <Icon className="size-4 shrink-0" />
      {children}
    </li>
  );
}

/** The card those rows sit in. `footer` is the wallet row on your own page. */
export function DetailsCard({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-3 text-sm font-semibold text-white">Details</h3>
      <ul className="space-y-3 text-sm">{children}</ul>
      {footer && (
        <div className="mt-4 border-t border-white/10 pt-4">{footer}</div>
      )}
    </div>
  );
}
