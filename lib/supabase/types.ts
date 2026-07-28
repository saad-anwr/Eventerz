/**
 * Row shapes for the tables in `supabase/migrations/0001_profiles.sql`.
 *
 * Hand-written rather than generated so the web app and the mobile app can
 * share the same contract without a codegen step. If you later run
 * `supabase gen types typescript`, replace this file with the output.
 */

export interface ProfileRow {
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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: ProfileUpdate;
      };
    };
    Functions: {
      link_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow;
      };
      profile_for_wallet: {
        Args: { p_wallet_address: string };
        Returns: ProfileRow | null;
      };
    };
  };
}
