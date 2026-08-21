# Eventerz - Wallet-native Event Infrastructure on Solana

> **Everything is On-chain. Why not your Meetups?**

A production-quality, premium marketing site for **Eventerz** - the wallet-native
event platform on Solana. Discover events, RSVP on-chain, mint NFT tickets,
collect proof-of-attendance, build portable reputation and join token-gated
communities.

Built to feel like a Series-A Web3 startup: deep-space dark UI, glassmorphism,
gradient glows, Framer-Motion animations and a fully interactive product demo.

---

## ✨ Highlights

- **Next.js 15 (App Router)** + **React 19** + **TypeScript**
- **TailwindCSS** design system (deep-space `#050816`, Solana purple -> blue -> cyan)
- **Framer Motion** - scroll reveals, parallax, tilt, magnetic buttons, animated counters
- **shadcn/ui-style** components (Radix accordion, CVA button) - fully component-based
- **Lucide** icons
- **Interactive demo** - pick an event, RSVP on-chain, watch an NFT ticket mint
- **Organizer dashboard** - animated analytics chart, stat counters, wallet insights
- **SEO-ready** - metadata, Open Graph, JSON-LD (Organization / WebSite / FAQ), `sitemap.xml`, `robots.txt`, PWA manifest
- **Fully responsive** - mobile, tablet, desktop; animated hamburger menu
- **Accessible** - keyboard focus rings, reduced-motion support, semantic landmarks
- **Vercel-ready**

---

## 🚀 Getting started

```bash
# 1. Install dependencies
npm install

# 2. (optional) configure integrations
cp .env.example .env.local   # then fill in values

# 3. Run the dev server
npm run dev                  # http://localhost:3000

# 4. Production build
npm run build && npm run start
```

Requires **Node 18.18+** (Node 20 LTS recommended).

---

## 🗂 Project structure

```
.
├── app/                      # App Router entry
│   ├── layout.tsx            # Fonts, metadata, SEO
│   ├── page.tsx              # Homepage (composes all sections + JSON-LD)
│   ├── globals.css           # Theme tokens, utilities, keyframes
│   ├── sitemap.ts            # /sitemap.xml
│   └── robots.ts             # /robots.txt
├── components/
│   ├── ui/                   # Reusable primitives (button, accordion,
│   │                         #   spotlight-card, stagger, counter, badge,
│   │                         #   marquee, magnetic, particles, logo)
│   ├── app/                  # Signed-in surfaces (event card, chat, guests)
│   ├── layout/               # navbar, footer, animated background
│   └── sections/             # One component per page section
├── hooks/                    # use-hydrated, use-scroll-lock
├── lib/                      # utils (cn), site config, content data, Solana,
│                             #   Supabase data access, i18n
├── public/                   # favicon.svg, icon.svg, og.svg, manifest
├── tailwind.config.ts
└── next.config.mjs
```

Every page section is a self-contained component in [`components/sections`](components/sections)
and is assembled in [`app/page.tsx`](app/page.tsx).

---

## 🧩 Page sections

Hero · Trusted By · Features · How it Works · Why Eventerz (comparison) ·
Interactive Demo · Organizer Dashboard · Communities · Roadmap · FAQ · CTA · Footer.

All copy lives in [`lib/data.ts`](lib/data.ts) and site-wide config in
[`lib/site.ts`](lib/site.ts) - edit these to re-theme the content in one place.

---

## 🧑‍🚀 The application (`/dashboard`, `/explore`, ...)

Beyond the marketing site, Eventerz ships a full, working app (routes under the
`app/(app)` group). It runs entirely on a **persisted local store**
([zustand](https://github.com/pmndrs/zustand) + `localStorage`) seeded with demo
users, events and chats - so everything works immediately, and the seams are
ready to swap for a real backend (Supabase / Anchor).

**Auth** - sign in with **Google, Apple or Email** (via the auth modal) _or_
**Connect Wallet** (Solana wallet adapter). A unified session
([`useSession`](components/auth/use-session.ts)) merges both.
> ⚠️ Social sign-in is **simulated** for the demo. Wire NextAuth/Auth.js or
> Supabase Auth with the credentials in [`.env.example`](.env.example) for prod.

**Features**

| Route              | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `/dashboard`       | Personalised home - upcoming events, stats, friend requests         |
| `/explore`         | Browse/search events with category & date filters                   |
| `/create`          | Create an event (with live preview, access rules, token-gating)     |
| `/events/[id]`     | Event page - RSVP, attendees, and **per-event group chat**          |
| `/my-events`       | Hosting / Attending / Past tabs                                     |
| `/friends`         | Discover people, **Add Friend**, accept requests, friends list      |
| `/messages`, `/messages/[id]` | **DM chat** - unlocked once both users are friends       |
| `/profile`, `/u/[id]` | Editable profile (name, bio, location, contact...) & public profiles |

Chats (event group chats and DMs) show a sender, day separators and per-message
timestamps, and persist across reloads.

State + domain model live in [`lib/store`](lib/store); the app UI in
[`components/app`](components/app) and [`components/auth`](components/auth).

---

## 🎨 Design system

| Token           | Value                                             |
| --------------- | ------------------------------------------------- |
| Background      | `#050816`                                         |
| Brand gradient  | `#9945FF` -> `#2F80FF` -> `#22D3EE`                  |
| Accent (Solana) | `#14F195`                                          |
| Display font    | Space Grotesk                                     |
| Body font       | Inter                                             |
| Mono font       | JetBrains Mono                                    |

Utilities like `.glass`, `.text-gradient`, `.gradient-border` and `.chip` are
defined in [`app/globals.css`](app/globals.css).

---

## 🔌 Where each integration lives

Nothing here is simulated. Every entry below is implemented at the path given,
and anything absent is absent rather than stubbed - a stub that returns a
plausible-looking success is how a UI ends up reporting a mint that never
happened. Env placeholders are in [`.env.example`](.env.example).

| Integration | Where |
| --- | --- |
| Wallet connect (Phantom / Backpack / Solflare) | [`components/wallet/providers.tsx`](components/wallet/providers.tsx) |
| Anchor program (RSVP, check-in) | [`lib/solana/use-onchain-actions.ts`](lib/solana/use-onchain-actions.ts) - hand-built instructions; see `Eventerz Program/README.md` for why the Anchor client is not used at runtime |
| Helius RPC | [`lib/solana/cluster.ts`](lib/solana/cluster.ts) |
| cNFT tickets & badges | `supabase/functions/mint-cnft/` - server-side, because a Bubblegum mint is signed by the tree authority |
| Token gating | `supabase/functions/check-gate/` - balance-comparison and display logic live entirely there; the create-event form only sets a boolean `tokenGated` flag |
| Reputation | derived in Postgres, migration `0013` |
| Supabase client | [`lib/supabase/client.ts`](lib/supabase/client.ts); data access in [`lib/supabase/data.ts`](lib/supabase/data.ts) |
| Newsletter | `subscribe_newsletter`, migration `0012` |
| Analytics | not wired. `app/error.tsx` logs to the console and nothing forwards it |

---

## ♿ Performance & accessibility

- Server-rendered content for SEO; client components are code-split automatically.
- Particle canvas is dynamically imported (`ssr: false`) and respects
  `prefers-reduced-motion`.
- Fonts are self-hosted via `next/font` (no layout shift, no external requests).
- Images/illustrations are inline SVG - no network round-trips.

---

## 📄 License

Placeholder marketing site - content and branding for demonstration purposes.

Built on **Solana**. 💜
