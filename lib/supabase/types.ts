/**
 * Row shapes for the tables in `supabase/migrations/0001_profiles.sql`.
 *
 * Hand-written rather than generated so the web app and the mobile app can
 * share the same contract without a codegen step. If you later run
 * `supabase gen types typescript`, replace this file with the output.
 */

/**
 * Declared as a `type`, not an `interface`, on purpose: supabase-js checks row
 * shapes against `Record<string, unknown>`, and only type aliases get an
 * implicit index signature. An interface here silently degrades every query's
 * inferred type to `never`.
 */
/**
 * The columns of `profiles` a client may read, as a PostgREST select list.
 *
 * Use this instead of `select('*')` on every profile query. `*` is not a fixed
 * set - it is "whatever columns exist when the query runs", so a column added
 * later is published to every caller by default, and the mistake surfaces as a
 * privacy incident rather than a build failure. Naming them makes exposure the
 * thing you opt into.
 *
 * This is belt to 0015's braces: the database refuses `email` regardless, and a
 * `select('*')` would now error rather than leak. The list is what keeps the
 * queries honest and the errors from happening in the first place.
 *
 * Kept as a single literal with `as const`, not a concatenation: supabase-js
 * infers the row type by parsing this string at the type level, and `'a' + 'b'`
 * widens to `string`, which collapses every profile query to
 * `GenericStringError`.
 */
export const PROFILE_COLUMNS =
  'id, name, handle, avatar_url, bio, location, website, twitter, twitter_verified, wallet_address, reputation, interests, created_at, updated_at' as const;

export type ProfileRow = {
  id: string;
  /** Set only by `sync_x_identity()`; no client grant exists (0020). */
  twitter_verified?: boolean;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  twitter: string | null;
  /** Primary identity. Null means wallet-pending. */
  wallet_address: string | null;
  /*
   * `email` is deliberately absent.
   *
   * The column exists, but 0015 revokes SELECT on it from `anon` and
   * `authenticated`, because `profiles` is world-readable and RLS cannot
   * exclude a single column - so publishing the row published every address we
   * hold, and the email -> wallet_address join along with it.
   *
   * Leaving it off the type is what stops it creeping back: a query that asks
   * for it now fails to compile rather than failing at runtime in production.
   * The signed-in user's own address comes from the session
   * (`supabase.auth.getUser()`), which is where it authoritatively lives.
   */
  reputation: number;
  interests: string[];
  created_at: string;
  updated_at: string;
}

export type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | 'name'
    | 'handle'
    | 'bio'
    | 'location'
    | 'website'
    | 'twitter'
    | 'interests'
    | 'avatar_url'
  >
>;

/**
 * supabase-js infers query types from this shape.
 *
 * Two constraints that are easy to get wrong, and both silently degrade every
 * query type to `never`:
 *
 *  1. It must be a `type`, not an `interface`. supabase-js checks
 *     `Database['public'] extends GenericSchema`, where `GenericSchema` uses
 *     index signatures (`Record<string, GenericTable>`). Type aliases get an
 *     implicit index signature; interfaces do not.
 *  2. `Tables`, `Views` and `Functions` are all required, as is `Relationships`
 *     on every table.
 */
export type EventRow = {
  id: string;
  title: string;
  description: string;
  host_id: string;
  community_id: string | null;
  cover_gradient: string;
  cover_image: string | null;
  category: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  is_online: boolean;
  capacity: number;
  price: string;
  visibility: string;
  requires_approval: boolean;
  token_gated: boolean;
  gate_requirement: string | null;
  // Structured gate (migration 0013). `token_gated` is true only when these
  // are set - a padlock that implies no checkable rule is the bug 0013 removes.
  gate_mint: string | null;
  gate_min_amount: string | null;
  gate_decimals: number | null;
  gate_symbol: string | null;
  tags: string[];
  schedule: unknown;
  featured: boolean;
  onchain_signature: string | null;
  created_at: string;
  updated_at: string;

  /*
   * Denormalised by trigger in 0005. These exist because the guest roster is
   * no longer world-readable: a stranger must still see "42 going" without
   * being able to enumerate the 42, and counting client-side from rows they
   * cannot select would report 0.
   */
  confirmed_count: number;
  pending_count: number;
  waitlist_count: number;
  checked_in_count: number;

  /*
   * Cancellation is soft (0007). The row survives so ticket holders keep the
   * record and the URL still resolves - a dead link where an event used to be
   * is a worse answer than a page saying it was called off.
   */
  cancelled_at: string | null;
  cancel_reason: string | null;

  /*
   * Structured location (0006), alongside the free-text `location` the host
   * typed. Null on every event created before that migration, and on any event
   * whose location never resolved to a place - both clients fall back to a
   * plain map search in that case, so null is a supported state and not a gap.
   */
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  address: string | null;
};

/**
 * `confirmed` - going, holds a seat and a ticket.
 * `pending`   - asked to join, waiting on the host.
 * `waitlist`  - event was full; promoted automatically when a seat frees.
 * `declined`  - the host said no.
 * `cancelled` - the guest withdrew.
 */
export type RsvpStatus =
  | 'confirmed'
  | 'pending'
  | 'waitlist'
  | 'declined'
  | 'cancelled';

export type RsvpRow = {
  id: string;
  event_id: string;
  profile_id: string;
  status: RsvpStatus;
  wallet_address: string | null;
  created_at: string;
};

/** `event_guests` view - an RSVP joined to its profile and ticket. */
export type EventGuestRow = {
  event_id: string;
  profile_id: string;
  status: RsvpStatus;
  created_at: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  reputation: number;
  ticket_id: string | null;
  ticket_serial: number | null;
  ticket_status: string | null;
  checked_in_at: string | null;
};

/** A bounded sample of confirmed guests, for people who may not read the roster. */
export type GuestPreview = {
  id: string;
  name: string;
  avatar_url: string | null;
};

export type TicketRow = {
  id: string;
  event_id: string;
  owner_id: string;
  asset_id: string | null;
  serial: number;
  status: string;
  soulbound: boolean;
  tier: string;
  qr_secret: string;
  minted_at: string;
  checked_in_at: string | null;
};

/**
 * A proof-of-attendance badge (migration 0013).
 *
 * Written by the check-in trigger, never by a client - there are no insert or
 * update policies on the table at all. `asset_id` stays null until a compressed
 * NFT is minted for it; the badge is the record of attendance either way.
 */
export type BadgeRow = {
  id: string;
  profile_id: string;
  event_id: string;
  asset_id: string | null;
  awarded_at: string;
  minted_at: string | null;
};

/** The shape `event_gate()` returns. Amounts are text - see the RPC comment. */
export type EventGateRow = {
  token_gated: boolean;
  gate_mint: string | null;
  gate_min_amount: string | null;
  gate_decimals: number | null;
  gate_symbol: string | null;
  gate_requirement: string | null;
};

export type FriendRequestRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  scope: 'event' | 'dm';
  channel_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /**
   * `payment` messages are written only by `record_payment` - the insert
   * policy on `messages` pins client writes to `text`, so a client cannot
   * post a receipt for a transfer that never happened.
   */
  kind: 'text' | 'payment';
  payment_id: string | null;
};

/**
 * A crypto transfer sent from a chat thread.
 *
 * `amount` is in the token's base units (lamports for SOL) and typed as a
 * string because Postgres `bigint` exceeds `Number.MAX_SAFE_INTEGER` and
 * PostgREST serialises it as a string for exactly that reason. Parse it with
 * `BigInt`, never `Number` - a silently truncated amount is the worst possible
 * bug in a payment path.
 */
export type PaymentRow = {
  id: string;
  signature: string;
  cluster: string;
  from_profile: string;
  to_profile: string | null;
  from_wallet: string;
  to_wallet: string;
  amount: string;
  /** Null for native SOL; an SPL mint address otherwise. */
  mint: string | null;
  symbol: string;
  decimals: number;
  memo: string | null;
  channel_id: string | null;
  /**
   * False until the `verify-payment` Edge Function has checked the signature
   * against the cluster. Render an unverified receipt without a tick: an
   * unchecked claim must not look like a checked one.
   */
  verified: boolean;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  profile_id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: string;
};

export type CommunityRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  accent: string;
  cover_gradient: string;
  token_gated: boolean;
  verified: boolean;
  owner_id: string | null;
  created_at: string;
};

/** `discoverable_people` view - a profile plus this viewer's relationship to it. */
export type DiscoverablePersonRow = ProfileRow & {
  friend_status: 'pending' | 'accepted' | 'declined' | null;
  request_sent_by_me: boolean | null;
};

/**
 * `profile_private` - fields that belong to one person only (migration 0019).
 *
 * Deliberately not folded into `ProfileRow`. That type describes a row anyone
 * can read, and putting a phone number in it would make every consumer of a
 * profile a potential leak of one.
 */
export type ProfilePrivateRow = {
  id: string;
  phone: string | null;
  updated_at: string;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Partial<ProfileRow> & { id: string },
        ProfileUpdate
      >;
      /*
       * Private fields, readable only by their owner (migration 0019).
       * `updated_at` is a trigger's job, so it is absent from both write types.
       */
      profile_private: Table<
        ProfilePrivateRow,
        { id: string; phone?: string | null },
        { phone?: string | null }
      >;
      events: Table<EventRow>;
      communities: Table<CommunityRow>;
      community_members: Table<{
        community_id: string;
        profile_id: string;
        joined_at: string;
      }>;
      rsvps: Table<RsvpRow>;
      tickets: Table<TicketRow>;
      notifications: Table<NotificationRow>;
      friend_requests: Table<FriendRequestRow>;
      messages: Table<
        MessageRow,
        // A client may only insert plain text. Receipts come from
        // `record_payment`; see migration 0009.
        Pick<MessageRow, 'channel_id' | 'sender_id' | 'body' | 'scope'>
      >;
      payments: Table<PaymentRow>;
      // Select-only from a client. Badges are written by the check-in trigger
      // and `record_badge_mint`, both SECURITY DEFINER; the table carries no
      // insert or update policy, so `never` is the accurate write type.
      badges: Table<BadgeRow, never, never>;
    };
    Views: {
      discoverable_people: {
        Row: DiscoverablePersonRow;
        Relationships: [];
      };
      event_guests: {
        Row: EventGuestRow;
        Relationships: [];
      };
    };
    Functions: {
      /** Reads the linked X identity server-side and adopts its handle (0020). */
      sync_x_identity: {
        Args: Record<string, never>;
        Returns: ProfileRow;
      };
      request_to_join: {
        Args: { p_event_id: string };
        Returns: RsvpRow;
      };
      /**
       * The entry requirement for a gated event.
       *
       * `gate_min_amount` is text, not number: the column is `numeric(40,0)` and
       * anything past 2^53 does not survive a JS number. Compare it as BigInt.
       */
      event_gate: {
        Args: { p_event_id: string };
        Returns: EventGateRow[];
      };
      approve_guest: {
        Args: { p_event_id: string; p_profile_id: string };
        Returns: RsvpRow;
      };
      decline_guest: {
        Args: { p_event_id: string; p_profile_id: string };
        Returns: RsvpRow;
      };
      event_guest_preview: {
        Args: { p_event_id: string; p_limit?: number };
        Returns: GuestPreview[];
      };
      is_confirmed_attendee: {
        Args: { p_event_id: string; p_profile_id: string };
        Returns: boolean;
      };
      promote_from_waitlist: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      update_event: {
        Args: {
          p_event_id: string;
          p_title?: string;
          p_description?: string;
          p_category?: string;
          p_starts_at?: string;
          p_ends_at?: string | null;
          p_clear_ends_at?: boolean;
          p_location?: string;
          p_is_online?: boolean;
          p_capacity?: number;
          p_price?: string;
          p_visibility?: string;
          p_requires_approval?: boolean;
          p_tags?: string[];
          p_cover_gradient?: string;
          p_cover_image?: string | null;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_place_id?: string | null;
          p_address?: string | null;
        };
        Returns: EventRow;
      };
      cancel_event: {
        Args: { p_event_id: string; p_reason?: string | null };
        Returns: EventRow;
      };
      my_waitlist_position: {
        Args: { p_event_id: string };
        Returns: number | null;
      };
      my_waitlist_positions: {
        Args: { p_event_ids: string[] };
        Returns: { event_id: string; queue_position: number }[];
      };
      record_payment: {
        Args: {
          p_signature: string;
          p_to_wallet: string;
          /**
           * A numeric *string*, not a number. The column is `bigint`, which
           * exceeds `Number.MAX_SAFE_INTEGER`; PostgREST accepts a string and
           * coerces it server-side, which is the only way to send a large
           * lamport amount without losing precision on the wire.
           */
          p_amount: string;
          p_channel_id?: string | null;
          p_to_profile?: string | null;
          p_memo?: string | null;
          p_mint?: string | null;
          p_symbol?: string;
          p_decimals?: number;
          p_cluster?: string;
        };
        Returns: PaymentRow;
      };
      my_dm_partners: {
        Args: Record<string, never>;
        Returns: { profile_id: string; last_message_at: string }[];
      };
      /**
       * Returns the full challenge *text* to sign, not a bare nonce - a wallet
       * popup showing an opaque UUID teaches users to approve opaque UUIDs.
       */
      issue_wallet_link_nonce: {
        Args: { p_wallet_address: string };
        Returns: string;
      };
      subscribe_newsletter: {
        Args: { p_email: string; p_source?: string };
        Returns: void;
      };
      unlink_wallet: {
        Args: Record<string, never>;
        Returns: ProfileRow;
      };
      /**
       * @deprecated Revoked in 0011 - it linked a wallet without checking that
       * the caller held its key. Use the `link-wallet` Edge Function.
       */
      link_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      profile_for_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      /** Legacy alias for `request_to_join`, kept for installed mobile builds. */
      rsvp: {
        Args: { p_event_id: string };
        Returns: RsvpRow;
      };
      cancel_rsvp: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      check_in_ticket: {
        Args: { p_ticket_id: string; p_qr_secret: string };
        Returns: TicketRow;
      };
      dm_channel_id: {
        Args: { a: string; b: string };
        Returns: string;
      };
      friend_ids: {
        Args: { p_profile_id: string };
        Returns: string[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
