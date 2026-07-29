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
export type ProfileRow = {
  id: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  twitter: string | null;
  /** Primary identity. Null means wallet-pending. */
  wallet_address: string | null;
  email: string | null;
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
  tags: string[];
  schedule: unknown;
  featured: boolean;
  onchain_signature: string | null;
  created_at: string;
  updated_at: string;
};

export type RsvpRow = {
  id: string;
  event_id: string;
  profile_id: string;
  status: string;
  wallet_address: string | null;
  created_at: string;
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

/** `discoverable_people` view — a profile plus this viewer's relationship to it. */
export type DiscoverablePersonRow = ProfileRow & {
  friend_status: 'pending' | 'accepted' | 'declined' | null;
  request_sent_by_me: boolean | null;
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
      messages: Table<MessageRow>;
    };
    Views: {
      discoverable_people: {
        Row: DiscoverablePersonRow;
        Relationships: [];
      };
    };
    Functions: {
      link_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      profile_for_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      rsvp: {
        Args: { p_event_id: string };
        Returns: TicketRow;
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
