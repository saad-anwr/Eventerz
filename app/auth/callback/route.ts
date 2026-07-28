/**
 * OAuth callback.
 *
 * Google redirects here with a one-time `code`. We exchange it for a session
 * (which sets the auth cookies) and bounce the user back where they started.
 *
 * This URL must be registered in Supabase → Authentication → URL Configuration
 * → Redirect URLs, for every origin you run on.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Google surfaces user-facing failures (consent denied, etc.) as params.
  const oauthError =
    searchParams.get('error_description') ?? searchParams.get('error');
  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/?auth_error=not_configured`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(error.message)}`,
    );
  }

  /*
   * Behind a proxy (Vercel), `origin` is the internal address. Prefer the
   * forwarded host so the user is not redirected to an unreachable URL.
   */
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocal = process.env.NODE_ENV === 'development';
  const base = isLocal || !forwardedHost ? origin : `https://${forwardedHost}`;

  // `next` is attacker-controllable — only ever redirect to a relative path.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return NextResponse.redirect(`${base}${safeNext}`);
}
