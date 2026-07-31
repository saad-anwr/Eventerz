import { describe, expect, it } from 'vitest';

import {
  RSVP_PRESENTATION,
  filledPercent,
  formatOrdinal,
  goingCount,
  hasEnded,
  isCancelled,
  isConfirmed,
  isEditable,
  isFull,
  myRsvpState,
  rsvpActionLabel,
  rsvpDetail,
  spotsLeft,
  waitlistDetail,
} from './events';
import type { EventItem, RsvpState } from './store/types';

const HOUR = 60 * 60 * 1000;

function event(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: 'e1',
    title: 'Solana Builders',
    description: '',
    hostId: 'host',
    coverGradient: 'from-brand-purple to-brand-blue',
    category: 'Meetup',
    startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
    location: 'Delhi',
    isOnline: false,
    capacity: 10,
    price: 'Free',
    visibility: 'public',
    requiresApproval: false,
    tokenGated: false,
    attendeeIds: [],
    tags: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('goingCount', () => {
  it('prefers the server counter over the roster length', () => {
    // The roster is gated by RLS, so for most viewers it holds at most
    // themselves. Deriving the count from its length would report 1 for an event
    // with forty guests.
    const e = event({ confirmedCount: 42, attendeeIds: ['me'] });
    expect(goingCount(e)).toBe(42);
  });

  it('falls back to the roster when there is no counter', () => {
    const e = event({ attendeeIds: ['a', 'b', 'c'] });
    expect(goingCount(e)).toBe(3);
  });

  it('reports zero rather than NaN when the counter is absent and empty', () => {
    expect(goingCount(event())).toBe(0);
  });
});

describe('myRsvpState', () => {
  it('trusts the server status over roster membership', () => {
    const e = event({ myStatus: 'pending', attendeeIds: ['me'] });
    expect(myRsvpState(e, 'me')).toBe('pending');
  });

  it('reads roster membership as confirmed for the demo store', () => {
    expect(myRsvpState(event({ attendeeIds: ['me'] }), 'me')).toBe('confirmed');
  });

  it('is undefined for someone who never asked', () => {
    expect(myRsvpState(event(), 'me')).toBeUndefined();
  });

  it('is undefined when nobody is signed in', () => {
    expect(myRsvpState(event({ attendeeIds: ['me'] }), null)).toBeUndefined();
  });
});

describe('capacity', () => {
  it('floors seats left at zero when capacity was lowered below the headcount', () => {
    // A host may reduce capacity to the current headcount but the counter can
    // still exceed it for an event edited before migration 0007's guard.
    const e = event({ capacity: 5, confirmedCount: 8 });
    expect(spotsLeft(e)).toBe(0);
    expect(isFull(e)).toBe(true);
  });

  it('clamps the progress bar at 100%', () => {
    expect(filledPercent(event({ capacity: 5, confirmedCount: 8 }))).toBe(100);
  });

  it('does not divide by zero', () => {
    expect(filledPercent(event({ capacity: 0, confirmedCount: 3 }))).toBe(0);
  });
});

describe('lifecycle', () => {
  it('treats an event as ended only once its end time has passed', () => {
    // The server accepts guests until `ends_at`, so an event that has started
    // and is still running must not read as ended.
    const running = event({
      startsAt: new Date(Date.now() - HOUR).toISOString(),
      endsAt: new Date(Date.now() + HOUR).toISOString(),
    });
    expect(hasEnded(running)).toBe(false);
  });

  it('falls back to the start time when there is no end time', () => {
    const past = event({ startsAt: new Date(Date.now() - HOUR).toISOString() });
    expect(hasEnded(past)).toBe(true);
  });

  it('detects cancellation and blocks editing', () => {
    const cancelled = event({ cancelledAt: new Date().toISOString() });
    expect(isCancelled(cancelled)).toBe(true);
    expect(isEditable(cancelled)).toBe(false);
  });

  it('blocks editing an event that has already happened', () => {
    expect(
      isEditable(event({ startsAt: new Date(Date.now() - HOUR).toISOString() })),
    ).toBe(false);
  });

  it('allows editing an upcoming, live event', () => {
    expect(isEditable(event())).toBe(true);
  });
});

describe('rsvpActionLabel', () => {
  it('promises the waitlist when full, even on an approval-gated event', () => {
    // Fullness wins: `request_to_join` checks capacity before approval, so a
    // button saying "Request to attend" would promise something the server will
    // not do.
    const e = event({ capacity: 1, confirmedCount: 1, requiresApproval: true });
    expect(rsvpActionLabel(e)).toBe('Join the waitlist');
  });

  it('promises a request when approval is required', () => {
    expect(rsvpActionLabel(event({ requiresApproval: true }))).toBe(
      'Request to attend',
    );
  });

  it('promises an immediate RSVP otherwise', () => {
    expect(rsvpActionLabel(event())).toBe('RSVP on-chain');
  });
});

describe('waitlist position', () => {
  it('falls back to the generic line when the position is unknown', () => {
    // An unloaded position must never render as "you are 0th in line".
    expect(waitlistDetail(event())).toBe(RSVP_PRESENTATION.waitlist.detail);
    expect(waitlistDetail(event({ waitlistPosition: 0 }))).toBe(
      RSVP_PRESENTATION.waitlist.detail,
    );
  });

  it('says "next" rather than "1st"', () => {
    expect(waitlistDetail(event({ waitlistPosition: 1 }))).toContain('next in line');
  });

  it('gives the ordinal place beyond first', () => {
    expect(waitlistDetail(event({ waitlistPosition: 3 }))).toContain('3rd in line');
  });

  it('specialises only the waitlist state', () => {
    const e = event({ waitlistPosition: 3 });
    expect(rsvpDetail(e, 'waitlist')).toContain('3rd');
    for (const status of ['confirmed', 'pending', 'declined', 'cancelled'] as RsvpState[]) {
      expect(rsvpDetail(e, status)).toBe(RSVP_PRESENTATION[status].detail);
    }
  });
});

describe('formatOrdinal', () => {
  it('handles the teens, which the naive rule gets wrong', () => {
    expect(formatOrdinal(11)).toBe('11th');
    expect(formatOrdinal(12)).toBe('12th');
    expect(formatOrdinal(13)).toBe('13th');
  });

  it('handles the ones', () => {
    expect(formatOrdinal(1)).toBe('1st');
    expect(formatOrdinal(2)).toBe('2nd');
    expect(formatOrdinal(3)).toBe('3rd');
    expect(formatOrdinal(4)).toBe('4th');
  });

  it('handles values past the teens', () => {
    expect(formatOrdinal(21)).toBe('21st');
    expect(formatOrdinal(22)).toBe('22nd');
    expect(formatOrdinal(23)).toBe('23rd');
    expect(formatOrdinal(111)).toBe('111th');
    expect(formatOrdinal(121)).toBe('121st');
  });
});

describe('isConfirmed', () => {
  it('is the gate for chat and the roster', () => {
    expect(isConfirmed(event({ myStatus: 'confirmed' }), 'me')).toBe(true);
    // A pending requester is not yet a guest - the host may still decline them.
    expect(isConfirmed(event({ myStatus: 'pending' }), 'me')).toBe(false);
    expect(isConfirmed(event({ myStatus: 'waitlist' }), 'me')).toBe(false);
    expect(isConfirmed(event({ myStatus: 'declined' }), 'me')).toBe(false);
  });
});

describe('RSVP_PRESENTATION', () => {
  it('covers every status the database can produce', () => {
    // A missing key renders `undefined.label` and crashes the card.
    const statuses: RsvpState[] = [
      'confirmed',
      'pending',
      'waitlist',
      'declined',
      'cancelled',
    ];
    for (const status of statuses) {
      expect(RSVP_PRESENTATION[status]?.label).toBeTruthy();
      expect(RSVP_PRESENTATION[status]?.detail).toBeTruthy();
    }
  });
});
