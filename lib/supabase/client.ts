'use client';

/**
 * Browser Supabase client.
 *
 * Returns `null` when the project is not configured, so callers must handle the
 * unconfigured case explicitly rather than crashing on a half-built client —
 * that is what keeps the demo running without a backend.
 */

import { createBrowserClient } from '@supabase/ssr';

import { isSupabaseConfigured, supabaseConfig } from './config';
import type { Database } from './types';

type Client = ReturnType<typeof createBrowserClient<Database>>;

let client: Client | null = null;

export function getSupabaseBrowserClient(): Client | null {
  if (!isSupabaseConfigured) return null;
  // Memoised: a new client per call would spawn duplicate auth listeners and
  // re-broadcast SIGNED_IN on every render.
  client ??= createBrowserClient<Database>(
    supabaseConfig.url,
    supabaseConfig.anonKey,
  );
  return client;
}
