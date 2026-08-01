export type AuthMethod = "google" | "apple" | "email" | "wallet";

export interface User {
  id: string;
  name: string;
  handle: string; // without @
  email?: string;
  phone?: string;
  bio?: string;
  location?: string;
  website?: string;
  twitter?: string;
  walletAddress?: string;
  /**
   * Uploaded profile picture.
   *
   * The column has existed since 0014 and `profileToUser` never read it, so
   * every consumer silently fell back to the gradient - a picture could be
   * stored and would never appear anywhere.
   */
  avatarUrl?: string;
  authMethod: AuthMethod;
  reputation: number;
  interests: string[];
  createdAt: number;
  /** Seeded demo accounts are discoverable but not "you". */
  seeded?: boolean;
}

export type EventCategory =
  | "Conference"
  | "Meetup"
  | "Hackathon"
  | "Workshop"
  | "Party"
  | "AMA"
  | "Concert"
  | "Other";

export interface EventItem {
  id: string;
  title: string;
  description: string;
  hostId: string;
  coverGradient: string;
  /** Uploaded banner URL. The gradient renders when absent. */
  coverImage?: string;
  category: EventCategory;
  startsAt: string; // ISO
  endsAt?: string;
  location: string;
  isOnline: boolean;
  capacity: number;
  price: string; // "Free" | "0.5 SOL"
  visibility: "public" | "private";
  requiresApproval: boolean;
  tokenGated: boolean;
  /**
   * Confirmed guests, and only when the viewer is allowed to see them - the
   * host or a confirmed guest. Empty for everyone else, which is why counts
   * below are separate rather than derived from this array's length.
   */
  attendeeIds: string[];
  tags: string[];
  createdAt: number;

  /**
   * Live counts, visible to everyone, maintained server-side by trigger.
   *
   * Optional because the local demo store has no server to maintain them -
   * there `attendeeIds` is the whole truth. Read these through `goingCount()`
   * and `myRsvpState()` in `lib/events.ts`, which handle both cases.
   */
  confirmedCount?: number;
  pendingCount?: number;
  waitlistCount?: number;
  checkedInCount?: number;
  /** This viewer's own RSVP state, or undefined if they have never asked. */
  myStatus?: RsvpState;

  /**
   * The viewer's 1-based place in the waitlist queue, when they are on it.
   *
   * Cannot be derived on the client: RLS returns a waitlisted guest exactly
   * one RSVP row - their own - so counting the people ahead of them means
   * counting rows they may not read. It comes from `my_waitlist_position`.
   */
  waitlistPosition?: number;

  /** Set when the host called the event off. The row survives; see 0007. */
  cancelledAt?: string;
  cancelReason?: string;

  /**
   * Structured location, when the host's input resolved to a place. Undefined
   * is a supported state, not a gap - the UI falls back to a map search on the
   * `location` string.
   */
  latitude?: number;
  longitude?: number;
  placeId?: string;
  /** Formatted address from the geocoder; `location` stays the host's wording. */
  address?: string;
}

/** Mirrors the `rsvp_status` enum in Postgres. */
export type RsvpState =
  | "confirmed"
  | "pending"
  | "waitlist"
  | "declined"
  | "cancelled";

export type FriendStatus = "pending" | "accepted" | "declined";

export interface FriendRequest {
  id: string;
  from: string; // userId
  to: string; // userId
  status: FriendStatus;
  createdAt: number;
}

export type MessageScope = "event" | "dm";

export interface Message {
  id: string;
  scope: MessageScope;
  channelId: string; // eventId (event) | "dm:<a>__<b>" (dm)
  senderId: string;
  text: string;
  createdAt: number;
}
