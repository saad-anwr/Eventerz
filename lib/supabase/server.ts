import 'server-only';

/**
 * Server-side Supabase client for Server Components, Route Handlers and
 * Server Actions.
 *
 * Auth state lives in cookies; this wires Supabase's cookie adapter to Next's
 * async `cookies()` store so sessions survive navigation and refresh.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { isSupabaseConfigured, supabaseConfig } from './config';
import type { Database } from './types';

export async function getSupabaseServerClient() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(
    supabaseConfig.url,
    supabaseConfig.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies. The middleware refreshes
            // the session instead, so this is safe to swallow.
          }
        },
      },
    },
  );
}

/** The signed-in user on the server, or null. Never throws. */
export async function getServerUser() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  // `getUser()` revalidates the JWT with the auth server. `getSession()` reads
  // the cookie without verifying it, so it must not be trusted server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

/** The signed-in user's profile row, or null. */
export async function getServerProfile() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return data;
}
