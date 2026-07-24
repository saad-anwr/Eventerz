# Eventerz — Wallet-native Event Infrastructure on Solana

> **Everything is On-chain. Why not your events?**

A production-quality, premium marketing site for **Eventerz** — the wallet-native
event platform on Solana. Discover events, RSVP on-chain, mint NFT tickets,
collect proof-of-attendance, build portable reputation and join token-gated
communities.

Built to feel like a Series-A Web3 startup: deep-space dark UI, glassmorphism,
gradient glows, Framer-Motion animations and a fully interactive product demo.

---

## ✨ Highlights

- **Next.js 15 (App Router)** + **React 19** + **TypeScript**
- **TailwindCSS** design system (deep-space `#050816`, Solana purple → blue → cyan)
- **Framer Motion** — scroll reveals, parallax, tilt, magnetic buttons, animated counters
- **shadcn/ui-style** components (Radix accordion, CVA button) — fully component-based
- **Lucide** icons
- **Interactive demo** — pick an event, RSVP on-chain, watch an NFT ticket mint
- **Organizer dashboard** — animated analytics chart, stat counters, wallet insights
- **SEO-ready** — metadata, Open Graph, JSON-LD (Organization / WebSite / FAQ), `sitemap.xml`, `robots.txt`, PWA manifest
- **Fully responsive** — mobile, tablet, desktop; animated hamburger menu
- **Accessible** — keyboard focus rings, reduced-motion support, semantic landmarks
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
│   ├── ui/                   # Reusable primitives (button, card, accordion,
│   │                         #   spotlight-card, reveal, counter, badge,
│   │                         #   marquee, magnetic, particles, logo, blob)
│   ├── layout/               # navbar, footer, animated background
│   └── sections/             # One component per page section
├── hooks/                    # use-mouse-position, use-media-query, use-scroll-lock
├── lib/                      # utils (cn), site config, content data, integrations
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
[`lib/site.ts`](lib/site.ts) — edit these to re-theme the content in one place.

---

## 🎨 Design system

| Token           | Value                                             |
| --------------- | ------------------------------------------------- |
| Background      | `#050816`                                         |
| Brand gradient  | `#9945FF` → `#2F80FF` → `#22D3EE`                  |
| Accent (Solana) | `#14F195`                                          |
| Display font    | Space Grotesk                                     |
| Body font       | Inter                                             |
| Mono font       | JetBrains Mono                                    |

Utilities like `.glass`, `.text-gradient`, `.gradient-border` and `.chip` are
defined in [`app/globals.css`](app/globals.css).

---

## 🔌 Future integrations

Front-end seams are stubbed in [`lib/integrations.ts`](lib/integrations.ts) with
mock returns and `TODO`s, plus env placeholders in [`.env.example`](.env.example):

- **Wallet Adapter** (Phantom / Backpack / Solflare)
- **Helius** RPC + DAS indexing
- **Anchor** program (on-chain RSVP / check-in)
- **Metaplex** compressed-NFT ticket minting
- **Supabase** off-chain indexing / metadata
- **Analytics** + **Newsletter** providers

Swap the stub bodies for real SDK calls when wiring the product.

---

## ▲ Deploy to Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add any `.env` values from `.env.example` (optional for the static site).
4. Deploy — the defaults work out of the box.

---

## ♿ Performance & accessibility

- Server-rendered content for SEO; client components are code-split automatically.
- Particle canvas is dynamically imported (`ssr: false`) and respects
  `prefers-reduced-motion`.
- Fonts are self-hosted via `next/font` (no layout shift, no external requests).
- Images/illustrations are inline SVG — no network round-trips.

---

## 📄 License

Placeholder marketing site — content and branding for demonstration purposes.

Built on **Solana**. 💜
