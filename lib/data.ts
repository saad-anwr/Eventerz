import {
  Wallet,
  CalendarCheck,
  Ticket,
  BadgeCheck,
  Lock,
  LayoutDashboard,
  Trophy,
  QrCode,
  Zap,
  Smartphone,
  Building2,
  Boxes,
  GraduationCap,
  Palette,
  Users,
  Rocket,
  Mic2,
  type LucideIcon,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Trusted-by logos                                                          */
/* -------------------------------------------------------------------------- */

export const trustedBy = [
  "Solana",
  "Helius",
  "Metaplex",
  "Phantom",
  "Backpack",
  "Solflare",
  "Dialect",
  "Arweave",
] as const;

/* -------------------------------------------------------------------------- */
/*  Features                                                                   */
/* -------------------------------------------------------------------------- */

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: "purple" | "blue" | "cyan" | "green";
}

export const features: Feature[] = [
  {
    icon: Wallet,
    title: "Wallet Authentication",
    description:
      "No emails, no passwords. Sign in with Phantom, Backpack or Solflare in a single tap — your wallet is your identity.",
    accent: "purple",
  },
  {
    icon: CalendarCheck,
    title: "On-chain RSVP",
    description:
      "Every RSVP is a verifiable transaction. Kill bots and ghost sign-ups with cryptographic proof of intent.",
    accent: "blue",
  },
  {
    icon: Ticket,
    title: "NFT Ticketing",
    description:
      "Mint compressed NFT tickets for fractions of a cent. Soulbound or transferable — you decide the rules.",
    accent: "cyan",
  },
  {
    icon: BadgeCheck,
    title: "Attendance Badges",
    description:
      "Proof-of-Attendance NFTs are dropped at check-in, building an on-chain record of where your community shows up.",
    accent: "green",
  },
  {
    icon: Lock,
    title: "Token-Gated Events",
    description:
      "Gate access by token, NFT or reputation score. Curate rooms for holders, DAOs and verified members only.",
    accent: "purple",
  },
  {
    icon: LayoutDashboard,
    title: "Organizer Dashboard",
    description:
      "Real-time analytics on RSVPs, mints, check-ins and revenue — with wallet-level insights you can export.",
    accent: "blue",
  },
  {
    icon: Trophy,
    title: "Community Reputation",
    description:
      "Portable, on-chain reputation that follows attendees across every community and event they touch.",
    accent: "cyan",
  },
  {
    icon: QrCode,
    title: "QR Check-in",
    description:
      "Scan-to-verify check-in that writes attendance on-chain in real time. Works on Seeker and any browser.",
    accent: "green",
  },
  {
    icon: Zap,
    title: "Fast Solana Transactions",
    description:
      "Sub-second finality and near-zero fees mean RSVPs, mints and check-ins feel instant — even at scale.",
    accent: "purple",
  },
  {
    icon: Smartphone,
    title: "Mobile-First Experience",
    description:
      "Built for the Solana Mobile ecosystem. A PWA and TWA experience that feels native on every device.",
    accent: "blue",
  },
];

/* -------------------------------------------------------------------------- */
/*  How it works                                                               */
/* -------------------------------------------------------------------------- */

export interface Step {
  index: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const steps: Step[] = [
  {
    index: "01",
    title: "Connect Wallet",
    description:
      "Link Phantom, Backpack or Solflare. Your wallet becomes your portable, self-owned identity.",
    icon: Wallet,
  },
  {
    index: "02",
    title: "Discover Event",
    description:
      "Browse curated, token-gated and public events surfaced for your community and interests.",
    icon: CalendarCheck,
  },
  {
    index: "03",
    title: "RSVP On-chain",
    description:
      "Confirm your spot with a signed transaction — bot-proof, verifiable and permanent.",
    icon: BadgeCheck,
  },
  {
    index: "04",
    title: "Receive NFT Ticket",
    description:
      "A compressed NFT ticket lands in your wallet instantly, ready for scan-to-enter check-in.",
    icon: Ticket,
  },
  {
    index: "05",
    title: "Attend Event",
    description:
      "Check in with a QR scan. Attendance is written on-chain and a POAP badge is minted to you.",
    icon: QrCode,
  },
  {
    index: "06",
    title: "Earn Reputation",
    description:
      "Every event levels up your portable reputation, unlocking gated communities and perks.",
    icon: Trophy,
  },
];

/* -------------------------------------------------------------------------- */
/*  Comparison                                                                 */
/* -------------------------------------------------------------------------- */

export const comparisonColumns = [
  "Eventbrite",
  "Meetup",
  "Luma",
  "Eventerz",
] as const;

export interface ComparisonRow {
  feature: string;
  values: [boolean, boolean, boolean, boolean]; // Eventbrite, Meetup, Luma, Eventerz
  partial?: [boolean, boolean, boolean, boolean];
}

export const comparisonRows: ComparisonRow[] = [
  { feature: "Wallet Native", values: [false, false, false, true], partial: [false, false, true, false] },
  { feature: "NFT Tickets", values: [false, false, false, true], partial: [false, false, true, false] },
  { feature: "Proof of Attendance", values: [false, false, false, true] },
  { feature: "Reputation Layer", values: [false, false, false, true] },
  { feature: "On-chain Identity", values: [false, false, false, true] },
  { feature: "DAO Support", values: [false, false, false, true] },
  { feature: "Token Gating", values: [false, false, false, true] },
];

/* -------------------------------------------------------------------------- */
/*  Interactive demo                                                           */
/* -------------------------------------------------------------------------- */

export interface DemoEvent {
  id: string;
  title: string;
  host: string;
  date: string;
  time: string;
  location: string;
  price: string;
  spotsLeft: number;
  totalSpots: number;
  tags: string[];
  gradient: string;
}

export const demoEvents: DemoEvent[] = [
  {
    id: "evt-001",
    title: "Solana Superteam Summit",
    host: "Superteam",
    date: "Aug 14",
    time: "6:00 PM",
    location: "Bengaluru",
    price: "Free",
    spotsLeft: 42,
    totalSpots: 300,
    tags: ["Conference", "Token-gated"],
    gradient: "from-brand-purple to-brand-blue",
  },
  {
    id: "evt-002",
    title: "Breakpoint Side Event: cNFT Night",
    host: "Metaplex",
    date: "Aug 22",
    time: "8:00 PM",
    location: "Singapore",
    price: "0.5 SOL",
    spotsLeft: 8,
    totalSpots: 120,
    tags: ["Meetup", "NFT"],
    gradient: "from-brand-blue to-brand-cyan",
  },
  {
    id: "evt-003",
    title: "Helius Devs & Draughts",
    host: "Helius",
    date: "Sep 03",
    time: "5:30 PM",
    location: "Online",
    price: "Free",
    spotsLeft: 156,
    totalSpots: 500,
    tags: ["Hackathon", "Public"],
    gradient: "from-brand-cyan to-brand-green",
  },
];

/* -------------------------------------------------------------------------- */
/*  Organizer dashboard                                                        */
/* -------------------------------------------------------------------------- */

export interface DashboardStat {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delta: string;
  icon: LucideIcon;
  accent: "purple" | "blue" | "cyan" | "green";
}

export const dashboardStats: DashboardStat[] = [
  { label: "Total Events", value: 128, delta: "+12%", icon: CalendarCheck, accent: "purple" },
  { label: "Tickets Minted", value: 48210, delta: "+34%", icon: Ticket, accent: "blue" },
  { label: "Attendance Rate", value: 92, suffix: "%", delta: "+6%", icon: BadgeCheck, accent: "cyan" },
  { label: "Revenue", value: 1840, prefix: "◎", delta: "+21%", icon: Trophy, accent: "green" },
];

/** Monthly ticket mints — used for the analytics chart (values 0–100 scale). */
export const analyticsSeries = [
  { month: "Jan", value: 32 },
  { month: "Feb", value: 41 },
  { month: "Mar", value: 38 },
  { month: "Apr", value: 55 },
  { month: "May", value: 62 },
  { month: "Jun", value: 74 },
  { month: "Jul", value: 68 },
  { month: "Aug", value: 88 },
  { month: "Sep", value: 96 },
];

export const recentEvents = [
  { name: "cNFT Night", attendees: 118, status: "Completed", wallet: "9xQe…4dRt" },
  { name: "Superteam Summit", attendees: 258, status: "Live", wallet: "3pKm…8sLp" },
  { name: "Devs & Draughts", attendees: 344, status: "Upcoming", wallet: "7vNa…2wQz" },
];

/* -------------------------------------------------------------------------- */
/*  Communities                                                                */
/* -------------------------------------------------------------------------- */

export interface Community {
  name: string;
  description: string;
  members: string;
  icon: LucideIcon;
  accent: "purple" | "blue" | "cyan" | "green";
}

export const communities: Community[] = [
  { name: "DAOs", description: "Coordinate governance meetups and gated member gatherings.", members: "1.2K+", icon: Boxes, accent: "purple" },
  { name: "Hackathons", description: "Run check-ins, bounties and POAPs for builders at scale.", members: "3.8K+", icon: Rocket, accent: "blue" },
  { name: "Universities", description: "Wallet-native clubs and campus events with real attendance.", members: "900+", icon: GraduationCap, accent: "cyan" },
  { name: "Creators", description: "Token-gate drops, IRL fan meetups and collectible tickets.", members: "2.1K+", icon: Palette, accent: "green" },
  { name: "Meetups", description: "Lightweight local events that stay verifiable and bot-free.", members: "5.4K+", icon: Users, accent: "purple" },
  { name: "Startups", description: "Host demo days and investor mixers with wallet insights.", members: "760+", icon: Building2, accent: "blue" },
  { name: "Conferences", description: "Sell NFT tickets and issue proof-of-attendance globally.", members: "1.6K+", icon: Mic2, accent: "cyan" },
];

/* -------------------------------------------------------------------------- */
/*  Roadmap                                                                     */
/* -------------------------------------------------------------------------- */

export interface RoadmapPhase {
  phase: string;
  title: string;
  status: "shipping" | "building" | "planned";
  items: string[];
}

export const roadmap: RoadmapPhase[] = [
  {
    phase: "Phase 1",
    title: "Foundation",
    status: "shipping",
    items: ["MVP launch", "Wallet integration", "Event creation & RSVP", "Mobile optimization"],
  },
  {
    phase: "Phase 2",
    title: "Reputation",
    status: "building",
    items: ["NFT attendance badges", "Reputation scoring", "Push notifications", "Organizer analytics"],
  },
  {
    phase: "Phase 3",
    title: "Ecosystem",
    status: "planned",
    items: ["DAO integrations", "Sponsored discovery", "Creator monetization", "Cross-chain & marketplace"],
  },
];

/* -------------------------------------------------------------------------- */
/*  FAQ                                                                         */
/* -------------------------------------------------------------------------- */

export interface FAQItem {
  question: string;
  answer: string;
}

export const faqs: FAQItem[] = [
  {
    question: "Why Solana?",
    answer:
      "Solana gives us sub-second finality, near-zero fees and native support for compressed NFTs — the exact primitives needed to make on-chain RSVPs, ticket mints and check-ins feel instant and cost effectively nothing, even for events with thousands of attendees.",
  },
  {
    question: "Why wallet login instead of email?",
    answer:
      "Your wallet is a self-owned identity you carry across every community. Signing in with Phantom, Backpack or Solflare removes passwords and email spam, eliminates bot sign-ups, and lets your tickets, badges and reputation live in one place you actually control.",
  },
  {
    question: "How do NFT tickets work?",
    answer:
      "When you RSVP, Eventerz mints a compressed NFT ticket directly to your wallet for a fraction of a cent. Organizers choose whether tickets are soulbound (non-transferable) or freely transferable, and each ticket carries verifiable metadata used for scan-to-enter check-in.",
  },
  {
    question: "What is on-chain reputation?",
    answer:
      "Every event you attend contributes to a portable reputation score recorded on-chain. Communities can gate access, unlock perks or reward loyal members based on real, verifiable participation — reputation that follows you everywhere, owned by you.",
  },
  {
    question: "How does Proof of Attendance (POAP) work?",
    answer:
      "At check-in, a QR scan writes your attendance to the chain and drops a Proof-of-Attendance NFT into your wallet. It's a permanent, tamper-proof record of where you actually showed up — perfect for building reputation and unlocking token-gated experiences.",
  },
  {
    question: "Can organizers monetize their events?",
    answer:
      "Yes. Organizers can sell NFT tickets, gate premium rooms by token or reputation, offer collectibles, run paid communities and access premium analytics. Revenue settles in SOL or SPL tokens directly to the organizer's wallet with transparent, low fees.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Hero / social-proof stats                                                  */
/* -------------------------------------------------------------------------- */

export const heroStats = [
  { label: "Events created", value: 12400, suffix: "+" },
  { label: "NFT tickets minted", value: 480000, suffix: "+" },
  { label: "Avg. mint cost", value: 0.0002, prefix: "$" },
  { label: "Communities", value: 320, suffix: "+" },
];
