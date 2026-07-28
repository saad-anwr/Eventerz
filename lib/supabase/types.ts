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
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: ProfileUpdate;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      link_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      profile_for_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
