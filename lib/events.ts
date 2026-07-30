/**
 * Event guest-state helpers.
 *
 * Two data sources have to produce the same answers: the live Supabase path,
 * where counts are denormalised columns and the roster may be hidden by RLS,
 * and the local demo store, where `attendeeIds` holds everyone and there are no
 * counts at all. Every screen reads through these so neither path needs a
 * special case at the call site.
 */

import type { EventItem, RsvpState } from '@/lib/store/types';

/** Confirmed guests. Falls back to the roster length for the demo store. */
export function goingCount(event: EventItem): number {
  return event.confirmedCount ?? event.attendeeIds.length;
}

/**
 * The viewer's own state for this event.
 *
 * `myStatus` is authoritative when present. The roster fallback exists for the
 * demo store, where membership is the only signal — and it can only ever mean
 * `confirmed`, since the demo store has no approval concept.
 */
export function myRsvpState(
  event: EventItem,
  userId: string | null | undefined,
): RsvpState | undefined {
  if (event.myStatus) return event.myStatus;
  if (userId && event.attendeeIds.includes(userId)) return 'confirmed';
  return undefined;
}

/** Seats left, floored at zero — capacity can be lowered below the headcount. */
export function spotsLeft(event: EventItem): number {
  return Math.max(0, event.capacity - goingCount(event));
}

export function isFull(event: EventItem): boolean {
  return spotsLeft(event) === 0;
}

/** Percentage full, clamped, for the progress bar. */
export function filledPercent(event: EventItem): number {
  if (event.capacity <= 0) return 0;
  return Math.min(100, Math.round((goingCount(event) / event.capacity) * 100));
}

/** True when the viewer holds a seat — the gate for chat and the guest list. */
export function isConfirmed(
  event: EventItem,
  userId: string | null | undefined,
): boolean {
  return myRsvpState(event, userId) === 'confirmed';
}

/* -------------------------------------------------------------------------- */
/*  Presentation                                                              */
/* -------------------------------------------------------------------------- */

export interface RsvpPresentation {
  /** Short label for a pill or badge. */
  label: string;
  /** Sentence explaining what happens next, for the RSVP card. */
  detail: string;
  /** Tailwind classes for the pill. */
  tone: string;
}

/**
 * How each RSVP state reads to the guest.
 *
 * Centralised so the wording is identical on a card, on the event page and in
 * the mobile app — a guest who sees "Requested" in one place and "Pending" in
 * another has to work out whether they are the same thing.
 */
export const RSVP_PRESENTATION: Record<RsvpState, RsvpPresentation> = {
  confirmed: {
    label: "You're going",
    detail: 'Your spot is confirmed and your ticket is ready.',
    tone: 'border-brand-green/30 bg-brand-green/10 text-brand-green',
  },
  pending: {
    label: 'Requested to attend',
    detail: 'The host has been notified. You will hear back here once they decide.',
    tone: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  },
  waitlist: {
    label: 'On the waitlist',
    detail: 'This event is full. You will be let in automatically if a spot opens.',
    tone: 'border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan',
  },
  declined: {
    label: 'Request declined',
    detail: 'The host declined this request.',
    tone: 'border-red-400/30 bg-red-400/10 text-red-300',
  },
  cancelled: {
    label: 'RSVP cancelled',
    detail: 'You cancelled your RSVP. You can ask to join again.',
    tone: 'border-white/15 bg-white/[0.04] text-muted-foreground',
  },
};

/**
 * The label for the primary action button, given what the viewer can do next.
 *
 * `requiresApproval` and fullness change the promise the button makes, and
 * making a promise the server will not keep is what made the old button feel
 * broken — it said "RSVP" and produced a pending request, or nothing at all.
 */
export function rsvpActionLabel(event: EventItem): string {
  if (isFull(event)) return 'Join the waitlist';
  if (event.requiresApproval) return 'Request to attend';
  return 'RSVP on-chain';
}
