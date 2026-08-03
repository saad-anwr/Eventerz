/**
 * Central site configuration - used across metadata, navigation and the footer.
 * Update these values in one place when wiring the real product.
 */

/**
 * Canonical origin, no trailing slash.
 *
 * `NEXT_PUBLIC_SITE_URL` wins so preview deployments can advertise their own
 * origin; the literal is the production fallback. This value drives
 * `metadataBase`, OG tags, the sitemap, robots.txt and - importantly - the
 * OAuth redirect, so it must match the domain the user is actually browsing.
 */
const canonicalUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://www.eventerz.xyz";

export const siteConfig = {
  name: "Eventerz",
  shortName: "Eventerz",
  tagline: "Everything is On-chain. Why not your events?",
  description:
    "Eventerz is wallet-native event infrastructure on Solana. Discover events, RSVP on-chain, receive NFT tickets and Proof-of-Attendance, build portable reputation and join token-gated communities.",
  url: canonicalUrl,
  ogImage: "/og.svg",
  keywords: [
    "Eventerz",
    "Solana events",
    "wallet-native events",
    "NFT ticketing",
    "on-chain RSVP",
    "Proof of Attendance",
    "POAP",
    "token-gated events",
    "Web3 events",
    "Solana ticketing",
    "event infrastructure",
  ],
  creator: "Eventerz Labs",
  links: {
    twitter: "https://twitter.com/eventerz_web",
    github: "https://github.com/saad-anwr/Eventerz",
    discord: "https://discord.gg/_saadanwar",
    docs: "/docs",
  },
} as const;

/** Primary navigation links (in-page anchors for the marketing site). */
export const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Demo", href: "#demo" },
  { label: "Roadmap", href: "#roadmap" },
  { label: "FAQ", href: "#faq" },
] as const;
