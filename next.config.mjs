/**
 * Content Security Policy.
 *
 * Every origin below is one the app actually talks to; anything not listed is
 * blocked. Keep this in step with `lib/geocode.ts`, `lib/maps.ts` and
 * `lib/solana/cluster.ts` - a new outbound host needs an entry here or it fails
 * at runtime with a console error and no network request.
 *
 * # `'unsafe-inline'` in script-src
 *
 * Present deliberately, and it is the weakest part of this policy. Next.js
 * inlines its hydration bootstrap in the HTML, so without it the App Router
 * does not boot at all. Removing it means switching to nonce-based CSP, which
 * needs the nonce generated in middleware and threaded onto every script tag -
 * worth doing, but it is a change that breaks the site when it is wrong, so it
 * does not belong in a pre-launch pass.
 *
 * What it costs is real: `'unsafe-inline'` means CSP is no longer a second line
 * of defence against XSS. It still blocks the *exfiltration* half of most
 * attacks, since `connect-src` is an allow-list and an injected script cannot
 * POST stolen data to an attacker's host.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // Avatars and event banners come from Supabase Storage and arbitrary
  // user-supplied URLs, so images are broad on purpose. `img-src` is the one
  // directive where a permissive value is not a meaningful risk.
  "img-src 'self' data: blob: https:",
  [
    "connect-src 'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co", // realtime
    "https://*.helius-rpc.com",
    "https://api.mainnet-beta.solana.com",
    "https://api.devnet.solana.com",
    "https://nominatim.openstreetmap.org", // keyless geocoding fallback
    "https://places.googleapis.com", // Places autocomplete, when a key is set
  ].join(" "),
  // Map embeds. Both are iframes, and neither can be replaced by a fetch.
  "frame-src https://www.google.com https://www.openstreetmap.org",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Headers applied to every response.
 *
 * `Strict-Transport-Security` is the one to be careful with: a browser that
 * sees it will refuse plain HTTP to this host for a year, and `includeSubDomains`
 * extends that to every subdomain - including any that is not on HTTPS yet.
 * That is the intended behaviour for a site handling real money, but it is not
 * quietly reversible, so it is stated here rather than inherited from a default.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    // Nothing here uses a camera, a microphone or the device's location: the
    // event location is typed, not sensed. Denying them means a compromised
    // dependency cannot ask either.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: csp },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
