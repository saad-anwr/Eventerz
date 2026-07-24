/**
 * Central site configuration — used across metadata, navigation and the footer.
 * Update these values in one place when wiring the real product.
 */
export const siteConfig = {
  name: "Eventerz",
  shortName: "Eventerz",
  tagline: "Everything is On-chain. Why not your events?",
  description:
    "Eventerz is wallet-native event infrastructure on Solana. Discover events, RSVP on-chain, receive NFT tickets and Proof-of-Attendance, build portable reputation and join token-gated communities.",
  url: "https://eventerz.xyz",
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
    twitter: "https://twitter.com/eventerz",
    github: "https://github.com/eventerz",
    discord: "https://discord.gg/eventerz",
    docs: "/docs",
  },
} as const;

export type SiteConfig = typeof siteConfig;

/** Primary navigation links (in-page anchors for the marketing site). */
export const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Demo", href: "#demo" },
  { label: "Roadmap", href: "#roadmap" },
  { label: "FAQ", href: "#faq" },
] as const;
