/**
 * Session refresh.
 *
 * Supabase access tokens are short-lived. Server Components cannot write
 * cookies, so without this middleware a user would silently fall out of their
 * session on the first expiry. Here we refresh the token and hand the updated
 * cookies to both the browser and the downstream request.
 *
 * No-ops entirely when Supabase is not configured.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { isSupabaseConfigured, supabaseConfig } from '@/lib/supabase/config';

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseConfig.url,
    supabaseConfig.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to the request so this render sees the fresh token…
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          // …and to the response so the browser stores it.
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touching `getUser()` is what triggers the refresh. Do not remove.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — auth cookies are
     * irrelevant there and the middleware would only add latency.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|og.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
