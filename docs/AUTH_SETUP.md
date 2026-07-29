# Real authentication — setup

Eventerz ships working with **no backend**: the site and the app both run on
mock data with a simulated session. This document turns that into real accounts
with real Google sign-in.

Nothing here is optional-but-nice — the app **cannot** authenticate a real user
until you complete steps 1–4, because only you can create credentials against
your own Google and Supabase accounts.

Budget ~15 minutes. Everything below is free tier.

---

## The identity model

Read this first — it explains why the UI says what it says.

**The wallet is the primary identity.** It is what owns tickets, holds badges,
carries reputation and signs on-chain actions.

**Google is a secondary credential.** It exists so an account is *recoverable* —
sign in on a new phone, get your profile back — and so a returning user resolves
to the wallet account they already own.

| | Wallet | Google |
| --- | --- | --- |
| Creates an account | ✅ | ✅ (wallet-pending) |
| Browse, profile | ✅ | ✅ |
| RSVP on-chain, NFT ticket, check-in | ✅ | ❌ needs a linked wallet |
| Recover on a new device | ❌ | ✅ |

A Google-only account is **wallet-pending**: it is a real, verified account, but
the UI prompts to connect a wallet before any on-chain action.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**
2. Name it `eventerz`, pick a region near your users, set a database password
3. Wait for provisioning (~2 min)
4. **Project Settings → API** and copy:
   - **Project URL** → `…SUPABASE_URL`
   - **anon / public** key → `…SUPABASE_ANON_KEY`

> The anon key is meant to be public — it ships in the client and Row Level
> Security is what protects your data. **Never** put the `service_role` key in
> any `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variable; it bypasses RLS entirely.

## 2. Run the schema

**SQL Editor → New query**, paste the contents of
[`supabase/migrations/0001_profiles.sql`](../supabase/migrations/0001_profiles.sql),
and run it.

That creates the `profiles` table, RLS policies, the trigger that provisions a
profile on signup, and the `link_wallet` function. It is safe to re-run.

Verify: **Table Editor** should now show `profiles`, and **Authentication →
Policies** should list three policies on it.

## 3. Create the Google OAuth client

1. <https://console.cloud.google.com/> → create or pick a project
2. **APIs & Services → OAuth consent screen**
   - User type **External**, fill in app name, support email, developer email
   - Scopes: the defaults (`email`, `profile`, `openid`) are all we request
   - While in *Testing*, only accounts you add as test users can sign in.
     **Publish** the app when you want it open to everyone.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application** — yes, *web*, even for the mobile
     app. Supabase is the OAuth client; the phone never talks to Google
     directly, which is what keeps the client secret off the device.
   - **Authorised redirect URIs** — add exactly one:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
     Find that URL in Supabase → **Authentication → Providers → Google**.
4. Copy the **Client ID** and **Client secret**.

## 4. Connect Google to Supabase

**Authentication → Providers → Google** → enable, paste the Client ID and
Client secret, save.

Then **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` for development
- **Redirect URLs** — add every origin you will run on:
  ```
  http://localhost:3000/auth/callback
  https://www.eventerz.xyz/auth/callback
  eventerz://auth/callback
  exp://127.0.0.1:8081/--/auth/callback
  ```

The last two matter for mobile:

| URL | When it is used |
| --- | --- |
| `eventerz://auth/callback` | Dev build and production app |
| `exp://127.0.0.1:8081/--/auth/callback` | Expo Go (the scheme differs) |

> Running Expo Go on a physical device? The `exp://` host is your machine's LAN
> IP, not `127.0.0.1`. Metro prints the exact URL on startup — add that one too.
> The app logs its redirect URL at sign-in time if you need to check.

## 5. Set the environment variables

**Website** — `Eventerz/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

**App** — `Eventerz dApp/.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Restart both dev servers. Metro caches env aggressively — use
`npx expo start --clear` the first time.

---

## 6. Deploying to Vercel

`.env.local` is gitignored and **local only**. A deployed site knows nothing
about it — this is the single most common reason production still shows
*"Demo mode"* after local sign-in already works.

### The one thing that trips everyone up

`NEXT_PUBLIC_*` variables are **inlined into the JavaScript bundle at build
time**, not read at runtime. So:

> Adding an environment variable does **nothing** to deployments that already
> exist. You must trigger a **new build** afterwards.

If you set the variables and reload the site without redeploying, you will see
exactly the same demo-mode behaviour and reasonably conclude it didn't work.

### Option A — dashboard

1. <https://vercel.com/saadanwr/eventerz/settings/environment-variables>
2. **Add New** for each, ticking **Production**, **Preview** and **Development**:

   | Key | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://zfijqnvzvnrchaemjfst.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs…` (the anon key) |

   Leave **Sensitive** off. These are public by design — the anon key ships in
   the browser bundle no matter what, and RLS is what protects your data.
   Marking it sensitive only stops *you* reading it back later.

3. **Deployments** tab → newest deployment → **⋯** → **Redeploy**
4. **Untick "Use existing Build Cache"** → Redeploy

Step 4 matters. With the cache on, Vercel can reuse the previously compiled
chunks that still have the old (empty) values baked in.

### Option B — CLI

Faster, and repeatable. From `Eventerz/`:

```bash
# One-time: bind this folder to the Vercel project
vercel link --scope saadanwr --project eventerz

# Add to all three environments
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
# each prompts for the value

# Ship a fresh production build
vercel --prod
```

Non-interactive (useful in CI):

```bash
echo "https://zfijqnvzvnrchaemjfst.supabase.co" \
  | vercel env add NEXT_PUBLIC_SUPABASE_URL production
```

Confirm what the project actually holds:

```bash
vercel env ls
vercel env pull .env.vercel.local   # writes them locally to diff against
```

### Register the deployed callback with Supabase

Vercel env vars alone are not enough — Google must be allowed to return to the
deployed origin. **Authentication → URL Configuration → Redirect URLs**:

```
https://www.eventerz.xyz/auth/callback
https://eventerz.xyz/auth/callback
https://*-saadanwr.vercel.app/auth/callback
```

Both `www` and the apex are listed on purpose: whichever host the browser is
on becomes the `redirect_to`, and Vercel serves both unless you force a
redirect. Missing one produces exactly the bug where sign-in bounces you to
the `.vercel.app` origin instead of your domain.

The wildcard covers preview deployments. This matters because every push gets a
unique URL like `eventerz-40k4o97e0-saadanwr.vercel.app` — adding those one at a
time is a losing game, and Supabase supports `*` for exactly this reason.

Also set **Site URL** to `https://www.eventerz.xyz`. That is the
fallback Supabase redirects to when a `redirect_to` is not allow-listed, so
getting it right turns a confusing silent failure into a survivable one.

### Verify the deployment

```bash
# The project ref should appear in the shipped bundle.
curl -s https://www.eventerz.xyz | grep -c zfijqnvzvnrchaemjfst
```

`0` means the build did not receive the variables — check the environment
checkboxes, then redeploy without cache.

Or just look at the sign-in modal footer:

| Footer text | Meaning |
| --- | --- |
| "Your wallet stays the primary identity…" | Live ✅ |
| "Demo mode — social sign-in is simulated" | Variables missing from that build |

### Preview deployments

Preview builds get their own env scope. If you tick only **Production**, every
preview URL stays in demo mode. Tick **Preview** too, and keep the wildcard
redirect URL above, or PR previews will fail at the callback.

---

## Verifying it works

**Website**

1. `npm run dev` → open <http://localhost:3000>
2. Sign in → **Continue with Google**
3. Real Google consent screen → back to the site signed in
4. Supabase → **Authentication → Users** shows a real user
5. **Table Editor → profiles** shows a row with the real name and avatar

The footer of the sign-in modal is the quickest tell: it says *"Demo mode —
social sign-in is simulated"* when unconfigured, and describes the wallet-primary
model when live.

**App**

1. `npx expo start --clear`
2. **Profile → Settings → Account recovery → Google account**
3. In-app browser opens the real consent screen
4. On return the row shows **Linked** with your actual email

Connect a wallet afterwards and it binds to the same account automatically.

---

## How the mobile flow works

Mobile uses **PKCE**, because a phone app cannot keep a client secret:

```
app  ──► supabase.auth.signInWithOAuth({ skipBrowserRedirect: true })
     ◄── consent URL
app  ──► WebBrowser.openAuthSessionAsync(url, eventerz://auth/callback)
             │
             └─► Google consent ──► Supabase ──► eventerz://auth/callback?code=…
app  ──► exchangeCodeForSession(code)     (verifier never leaves the device)
     ◄── session, stored in expo-secure-store
```

The session lives in **expo-secure-store** (Keystore / Keychain), not
AsyncStorage — it contains a refresh token, which is a bearer credential.
Large sessions are transparently chunked because SecureStore caps values at
2048 bytes on some Android builds.

---

## Security notes

**What is protected.** RLS is on for `profiles`. Anyone may read profiles —
attendee lists and host cards need that — but only the owner can write their own
row, enforced by `auth.uid() = id` on both `USING` and `WITH CHECK`.

**Wallet linking is not yet proof of ownership.** `link_wallet` refuses a wallet
already claimed by another account, so it cannot be stolen. But it currently
trusts that the caller controls the address it passes. Before you handle real
value, add signature verification:

1. Client signs a nonce with the wallet
2. An Edge Function verifies the signature against the address
3. Only then does it call `link_wallet`

The seam is deliberate — `link_wallet` is already `SECURITY DEFINER` and
callable only by `authenticated`, so the Edge Function slots in front without
schema changes.

**Definer functions pin `search_path`.** Both `handle_new_user` and
`link_wallet` set `search_path = public` to defeat search-path hijacking, the
standard hazard with `SECURITY DEFINER`.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `redirect_uri_mismatch` from Google | The URI in Google Cloud must be the **Supabase** callback (`https://<ref>.supabase.co/auth/v1/callback`), not your app's |
| Sign-in returns but the user is signed out | The app's redirect URL is missing from Supabase → URL Configuration |
| Works on web, not in Expo Go | Add the `exp://…/--/auth/callback` URL — Expo Go uses a different scheme than the dev build |
| "Demo mode" still showing | Env vars not picked up. Restart with `--clear`; check the `NEXT_PUBLIC_` / `EXPO_PUBLIC_` prefix |
| User created, no profile row | The `handle_new_user` trigger did not run — re-run the migration |
| `403` on profile update | RLS working as intended: you are updating a row that is not yours |
| Only some Google accounts can sign in | Consent screen still in *Testing* — publish it, or add test users |

---

## What is still simulated

Honest inventory after this setup:

- ✅ **Google sign-in** — real OAuth, real user, real profile
- ✅ **Email sign-in** — real one-time link (no passwords stored)
- ✅ **Profiles** — real Postgres rows with RLS
- ⚠️ **Wallet** — the mobile app still uses the mock adapter until you enable
  Mobile Wallet Adapter (see the app's README). The website uses the real
  Solana wallet adapter already.
- ❌ **Events, tickets, RSVPs** — still mock data on both platforms. Auth is
  real; the event layer is not. Point the repositories at Supabase next.
- ❌ **Apple sign-in** — the button is present but disabled when live. Enable
  the Apple provider in Supabase and remove the guard in `auth-modal.tsx`.
