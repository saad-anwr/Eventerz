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

import {
  authCookieOptions,
  isSupabaseConfigured,
  supabaseConfig,
} from './config';
import type { Database } from './types';

export async function getSupabaseServerClient() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(
    supabaseConfig.url,
    supabaseConfig.anonKey,
    {
      cookieOptions: authCookieOptions,
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

/*
 * Callers that need the signed-in user server-side should read it from this
 * client with `supabase.auth.getUser()`, which revalidates the JWT with the
 * auth server. `getSession()` reads the cookie without verifying it, so it must
 * not be trusted here.
 */
