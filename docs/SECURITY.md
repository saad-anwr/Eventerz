# Security notes

What is enforced, where, and - the part that matters more - what is **not**.

Referenced from `package.json` (the `//overrides` note) and from
`docs/GUEST_FLOW.md`.

---

## The one principle everything follows

**RLS restricts which rows you may touch. It never restricts which values you may
set.**

Almost every design decision below falls out of that sentence. A policy saying
"you may update your own RSVP" permits `update rsvps set status = 'confirmed'`,
which walks past capacity, approval and ticket allocation. A policy saying "a
host may update their own event" permits rewriting `confirmed_count` to 500 or
reassigning `host_id`.

So the tables that carry consequences have **no client write policies at all**,
and every write goes through a `SECURITY DEFINER` function that writes a fixed
column list:

| Table | Client writes | Why |
| --- | --- | --- |
| `rsvps` | none | Status is the server's decision, not the guest's |
| `payments` | none | A client could set `verified = true`, or record a payment *from* someone else |
| `messages` | INSERT, pinned to `kind = 'text'` | A payment receipt must only come from `record_payment` |
| `events` | host-only UPDATE **plus** function paths | The policy exists for compatibility; `update_event` is what the UI uses |
| `wallet_link_nonces` | none, and no SELECT either | One user must not enumerate another's outstanding challenges |
| `event_reminders` | none | Bookkeeping; the job writes it as the definer |
| `newsletter_subscribers` | none, and no SELECT either | A list of email addresses belonging to people who did not agree to be published |

With RLS on and no policy present, a direct write is refused outright. That is
the mechanism - not an oversight.

Every definer function sets `search_path = public`, which is the standard defence
against search-path hijacking.

---

## Trust boundaries, stated plainly

### Wallet ownership - **verified**

Ed25519 signature over a server-minted, single-use, five-minute challenge, checked
in the `link-wallet` Edge Function, which then calls a function revoked from
`authenticated`. Full write-up in `docs/AUTH_SETUP.md`.

Before migration `0011` this was unverified, and it was the most serious hole in
the schema: claiming a well-known address granted its reputation, its ticket
history and - once payments existed - a receipt trail saying money went to a
person it did not go to.

### Payment receipts - **verified asynchronously, and labelled until then**

`record_payment` cannot check a signature: Postgres makes no outbound RPC calls.
So a receipt is written `verified = false`, every surface renders it with a clock
rather than a tick, and `verify-payment` confirms the recipient's balance delta
against the cluster before `mark_payment_verified` flips it.

`mark_payment_verified` is revoked from `authenticated`, `anon` **and** `public`.
The party who benefits from the flag cannot set it.

What is enforced synchronously, because it is the part a lie would profit from:

- you may only record a payment as yourself;
- a named recipient must actually hold the wallet that was paid, so a real
  signature lifted off the explorer cannot be recorded as "I paid you";
- the receipt message is written by the function, and the `messages` insert policy
  forbids a client from writing one.

**An unverified receipt is not a trusted receipt.** Rendering all receipts
identically would make the tick decorative, and a decorative trust signal is
worse than none.

### Guest-list privacy - **enforced in Postgres**

| Viewer | Sees |
| --- | --- |
| Host | Every RSVP, including declined and cancelled |
| Confirmed guest | Other **confirmed** guests only |
| Anyone else | Counts, plus up to 3 sample faces |

Confirmed guests are restricted to `confirmed` rows deliberately: letting peers
enumerate rejections would publish the host's moderation decisions.

`event_guest_preview` is `SECURITY DEFINER` so it can sample rows the caller
cannot select, and clamps its limit to `[0, 12]` **server-side** so it cannot be
widened into a full roster dump.

### On-chain capacity - **enforced twice, on purpose**

The Anchor program checks capacity as well as Postgres. It would be reasonable to
argue the chain should trust the backend, since the backend decides who gets in.
It should not: a seat account creatable past capacity makes the on-chain record
say something the host never agreed to, and "the database would have stopped it"
is not a property anyone reading the chain can verify.

### Signatures - **never fabricated**

`MobileWalletAdapter.signAndSendTransaction` refuses an Eventerz-program intent
while no program is deployed. It used to send a zero-lamport self-transfer as a
stand-in, which produced a real, confirmable signature for a transaction that did
nothing - the UI would report a minted ticket and the explorer would appear to
agree. An honest failure beats that comfortably.

The one intent that always works is `transfer`: it is a System Program
instruction and needs no program of ours.

---

## Public by design

Three values are exposed to clients and are **meant** to be:

| Value | Why it is safe |
| --- | --- |
| `SUPABASE_ANON_KEY` | Identifies the project, not a user. RLS is what protects data |
| `GOOGLE_MAPS_API_KEY` | Restrict by HTTP referrer (web) and package + SHA-1 (Android) |
| `EVENTERZ_PROGRAM_ID` | A public address on a public chain |

One value must never be: **`SUPABASE_SERVICE_ROLE_KEY`** bypasses RLS entirely.
It must never carry a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` prefix. It is set as an
Edge Function secret and used only to call the two functions explicitly revoked
from `authenticated` - the ones whose whole purpose is to do something the caller
must not do for themselves.

A service-role query has **no authorisation of its own**, which is the standard way
an Edge Function turns a private table into a public one. Both functions therefore
check membership explicitly: `verify-payment` refuses a receipt the caller is not
a party to, even though it read the row with a key that ignores the policy.

---

## Secrets in git history - **rotated; revocation outstanding**

Recorded here because a leak that has been tidied up looks identical to one that
never happened, and only one of them still needs action.

A billable **Helius RPC key** was committed to the `Eventerz dApp` repository, in
the `base` profile of `eas.json` and inside the tracked build artifact
`eventerz-arm64-release.apk`. Both are cleaned up in the working tree: `eas.json`
resolves its credentials from EAS environment variables, and `*.apk` / `*.aab`
are gitignored.

The working tree is not the exposure. `github.com/saad-anwr/Eventerz-dApp` is
**public**, and the key was pushed to it: committed 31 Jul 2026 20:03, removed
from HEAD 1 Aug 2026 13:35 - roughly 17½ hours readable by anyone, and still
reachable from 6 historical commits on the remote:

```bash
git log -p -- eas.json | grep api-key
```

**The key must be rotated in the Helius dashboard**, and treated as already
scraped: public repos are harvested for keys continuously. Removing it from HEAD
stops it spreading; it does not make the leaked value stop working. Steps are in
the root `README.md`.

**Status, 4 Aug 2026: rotated. One step left.**

| | |
| --- | --- |
| New key issued | done |
| `Eventerz/.env.local`, `Eventerz dApp/.env` | done |
| EAS variable (`preview`, `production`, sensitive) | done |
| Build guards retired | done |
| Vercel | **never held this key** - the site has used the public RPC fallback throughout |
| **Old key revoked in Helius** | **outstanding - it still serves requests** |

Revocation is the step that closes this. Everything else moves *new* traffic to
the new key; none of it stops the old one, which was public for ~17½ hours and
should be assumed scraped.

Revoking carries no risk to the website: `NEXT_PUBLIC_HELIUS_RPC_URL` was never
configured on Vercel, so production has been using the public
`api.mainnet-beta.solana.com` fallback rather than the leaked key. That is its
own problem - see *Known gaps* - but it means the leak never reached the web
deployment at all.

### What stands in the way

Two of these were temporary and were retired on rotation; the first is permanent
and is the one that matters for next time.

| Control | Where | Effect |
| --- | --- | --- |
| Pre-commit credential scan | `.githooks/pre-commit` -> `scripts/check-secrets.mjs`, **both repos** | Refuses a commit containing a key, a JWT, a private-key block or a signing artefact. Scans inside binaries too - the APK leaked because a key compiled into a bundle is plain ASCII inside the file. Override: `ALLOW_SECRETS=1` |
| ~~Production build gate~~ | `lib/env.ts` | **retired 4 Aug 2026** on rotation. Failed `next build` while the leaked key was configured |
| ~~Mainnet readiness gate~~ | `Eventerz dApp/scripts/check-mainnet.mjs` | **retired 4 Aug 2026** on rotation. Exited non-zero on the same condition |

Both gates matched a **SHA-256** of the key rather than the key: these files are
committed, and committing the value again is the whole mistake. A 128-bit key
behind SHA-256 is not recoverable from a hash, but an exact match is detectable,
which is all a check needs. They were removed by `npm run rotate:helius:finish`
once the key they guarded against was gone, so they live in git history rather
than as a permanent monument to a fixed problem.

### Audit, 3 Aug 2026 - HEAD and full history, all three repos

| Value | Committed? | Action |
| --- | --- | --- |
| `HELIUS_RPC_URL` (API key) | Yes - 6 commits in `eas.json`, plus 2 carrying the APK | **Rotate** |
| `SUPABASE_ANON_KEY` | Yes - same block. Verified `"role":"anon"`, not service-role | None; public by design, RLS enforced |
| `SUPABASE_SERVICE_ROLE_KEY` | **Never**, in either repo | None |
| Upload keystore (`*.jks`) | **Never**; gitignored | None |
| Anything in the `Eventerz` website repo | **Never** - no credential in any commit | None |
| Hardcoded secrets in tracked source | **None**, all three projects | None |

The local `eventerz-arm64-release.apk` was **deleted**: the live leaked key was
recoverable from it with `grep`, and it would have been the artifact shipped to
the Solana dApp Store. Rebuild with `npm run apk` after rotating.

The anon key's safety is conditional, not inherent: it is safe *because* RLS is
enabled on every table. Verified 3 Aug 2026 - **all 17** tables have
`enable row level security`. Ship a table without a policy and that row of the
table above becomes wrong.

Rewriting history was considered and rejected. Force-pushing a rewritten
`Eventerz-dApp` breaks every clone and fork, and cannot un-publish a value that
was readable for 17 hours. Rotation makes the old key worthless, which is the
only outcome that holds.

### The RPC key is no longer client-side - it goes through a proxy

`NEXT_PUBLIC_` and `EXPO_PUBLIC_` values are inlined into the bundle at build
time. A Helius URL shipped that way is extractable from any published web bundle
or APK with `grep api-key`, which is exactly how the leaked key was recoverable
from the committed APK. EAS's `--visibility sensitive` keeps it out of build logs
and the dashboard, which is worth having, but it does not keep it out of the
artifact.

For the **website** that is now fixed rather than mitigated. The browser talks to
`/api/rpc` on our own origin; `app/api/rpc/route.ts` forwards to Helius using a
**server-only `HELIUS_RPC_URL`** with no `NEXT_PUBLIC_` prefix, so the value is
read at runtime and never enters the client bundle. Verified by building and
grepping: zero occurrences of the key, of `api-key=`, or of `helius-rpc.com` in
`.next/static`.

A bare pass-through would be worse than the leak - an unauthenticated public RPC
billed to us, which needs no extraction and cannot be revoked without a deploy.
So the route carries three controls, and they are load-bearing:

| Control | What it stops |
| --- | --- |
| **Method allowlist** (18 methods, derived from the call sites) | The endpoint being used as a general-purpose RPC. Anything absent is refused by name, so a genuine omission is a clear error rather than a mystery inside web3.js |
| **Same-origin check** (`Origin`, then `Referer`) | Another site pointing its wallet adapter at us. `Origin` is set by the browser and cannot be forged by page JavaScript - it does *not* stop `curl`, which is what the limit below is for |
| **Per-IP rate limit** + body and batch caps | A script hammering the endpoint. Best-effort: edge instances are ephemeral, so it counts per instance rather than globally. Exactness would need a shared store (KV/Upstash), not a bigger map |

One consequence worth knowing: **confirmation had to stop using WebSockets.**
`connection.confirmTransaction` confirms via `signatureSubscribe`, and a route
handler serves HTTP - the derived `wss://…/api/rpc` has nothing listening. Left
alone that fails in the worst available shape: the transaction lands, the socket
never answers, and the UI sits on "confirming" while the money has already moved.
`lib/solana/confirm.ts` polls `getSignatureStatuses` instead and compares against
`lastValidBlockHeight`, so an expired blockhash is reported as "did not go
through" immediately rather than after an arbitrary timeout.

**The dApp still ships its key in the APK.** `EXPO_PUBLIC_HELIUS_RPC_URL` is
inlined into the bundle and extractable, unchanged by any of the above. It could
point at the same proxy, at the cost of coupling the app's availability to the
website's; until it does, the mobile key's protection is the Helius domain
allowlist and its spend cap. Treat the two keys as separate credentials with
separate blast radii.

---

## Column privileges - **the rules only bind because of these**

Every business rule in this schema lives in a SECURITY DEFINER function:
`rsvp()` checks capacity, `request_to_join_verified()` checks the token gate,
`link_wallet_verified()` checks an Ed25519 signature, `recompute_reputation()`
derives reputation from attendance.

None of that binds a client unless the function is the *only* way in, and until
0017 it was not. Supabase grants `ALL` on every table in `public` to `anon` and
`authenticated` at project setup, and no migration had ever narrowed that - every
`grant`/`revoke` in 0001-0016 was `on function`. RLS was the only control on
direct writes, and RLS is row-level: a policy says which **rows** you may write,
never which **columns**.

So `for update using (auth.uid() = id)` meant "you may rewrite any column of your
own row", and PostgREST publishes that as an HTTP request. The TypeScript
`ProfileUpdate` type lists the editable fields, but a type is a client-side
courtesy - `curl` does not import it.

Five one-request escalations followed, all now closed by 0017:

| Column | What a single PATCH bought | Which guarantee it voided |
| --- | --- | --- |
| `profiles.wallet_address` | Claim any unclaimed wallet, and its reputation and ticket history | 0011's nonce + signature + Edge Function, entirely |
| `profiles.reputation` | Any number you like | 0013's "cannot be inflated by anyone - including the profile's owner" |
| `rsvps.status` | Self-confirm into a full or gated event | `approve_guest`, capacity, waitlist, and the token gate |
| `events.featured` | Your own event on the home page | Editorial placement |
| `communities.verified` | Your own verified badge | The badge meaning anything |

0017 grants writes **per column**, and only where a client legitimately writes.
0009 already did this for `messages` - its insert policy pins `kind = 'text'` and
`payment_id is null`, so a forged payment receipt cannot be inserted into a
thread - which is the same idea expressed in a policy rather than a grant.

The rule to keep: **a new column is not writable until someone grants it.** If a
client needs to write one, add it to the grant in 0017 and say why. If a rule is
enforced in a function, the table it guards must not be directly writable, or
the function is advice rather than a gate.

## Known gaps

Listed because an unlisted gap is a gap nobody fixes.

1. **9 npm advisories remain on the website**, all one path: `uuid@8.3.2` under
   `jayson` under `@solana/web3.js` v1. The advisory is a missing bounds check in
   `v3/v5/v6` **when the caller supplies its own buffer**; jayson only calls
   `v4()` with no buffer, so the vulnerable code is unreachable from here.
   Forcing uuid 11 would be a major bump across a CJS/ESM boundary to fix a path
   that cannot be hit - trading real breakage risk for a cosmetic audit number.
   The permanent fix is the `@solana/web3.js` v2 migration.

   The other 22 (postcss path traversal + arbitrary file read + `</style>` XSS,
   sharp's inherited libvips CVEs, brace-expansion DoS) are pinned out via
   `overrides` in `package.json`, all patch-or-minor inside the same major, with
   `next build` as the proof.

2. **Rate limiting is now partial** (0016, 0018). Every Edge Function consumes
   quota from `check_rate_limit` keyed on the caller's profile id, `messages`
   has a 30/minute flood ceiling enforced by trigger, and
   `subscribe_newsletter` allows an address 3 attempts an hour.

   What is still open is the anonymous case. The subject that matters for the
   newsletter form is the caller's **IP**, and Postgres cannot see it -
   PostgREST terminates the connection, so the database only ever sees its own
   client. The per-address limit closes a form retried in a loop with one
   address and does nothing against a flood that varies the address each time.
   The fix is to move that form behind an Edge Function and call `rateLimit()`
   with `x-forwarded-for`, exactly as the other functions do.

3. **No host-side audit trail** for approve / decline / remove / edit decisions.
   The notifications are the only record, and they live in the recipient's row.

4. **Release APK is signed with the debug keystore.** Fine for sideloading, not
   for the dApp Store. There is no release APK on disk right now: the previous
   one was deleted because the leaked Helius key was extractable from it. The
   next build must come after rotation.

5. **The two hand-written Anchor clients must agree with the Rust by hand.**
   Two checks exist in the program workspace and neither runs automatically yet:
   `npm run idl:sync` compares against the IDL that `anchor build` emits (the
   authority, but it needs the Rust toolchain), and `npm run verify:clients`
   derives the same discriminators straight from `lib.rs` with nothing but Node -
   so it is the one that can actually run here. The website's test suite
   recomputes them too. Last run 3 Aug 2026: both clients agree, 8 instructions
   and 2 accounts. See the CI item in `HANDOFF.md`.

6. ~~**The website has been running on the public RPC in production.**~~ Found
   4 Aug 2026 - `NEXT_PUBLIC_HELIUS_RPC_URL` had never been set on the Vercel
   project, so `rpcEndpoint()` fell back to `api.mainnet-beta.solana.com` for the
   life of the deployment. Silent apart from one browser-console warning per page
   load, which is why it went unnoticed.

   Now superseded by the proxy: the variable to set is **`HELIUS_RPC_URL`**, no
   prefix, read server-side by `/api/rpc`. **Outstanding until that is set on
   Vercel** - a prefixed leftover republishes the key and is warned about at build
   time.

   One accidental upside of the gap: the key that leaked never reached Vercel, so
   the website was never serving it.

7. **`NEXT_PUBLIC_SITE_URL` is scoped to Production only.** It is in `REQUIRED`
   in `lib/env.ts`, and a Vercel *Preview* build runs `next build` with
   `NODE_ENV=production` - so `assertProductionEnv()` fires and throws on a
   missing required variable. Preview deployments should be failing at build.
   Either scope the variable to Preview as well, or narrow the check to
   `VERCEL_ENV === 'production'`.

8. ~~**`Eventerz Program/` is not under version control.**~~ Fixed - the folder
   is now a git repo with an initial commit and a `.gitattributes` pinning LF,
   so the Rust that builds under WSL2 does not churn against CRLF checkouts.

9. **The generated Android project can drift from `app.json`, silently.**
   `android/` is produced by `expo prebuild` and is gitignored, so it is not
   regenerated by a normal build. It had fallen behind: `app.json` set
   `recordAudioAndroid: false`, and the installed APK requested the microphone
   anyway, along with `SYSTEM_ALERT_WINDOW`. Reading the config told you nothing
   reliable about the artefact users install.

   Now blocked explicitly via `android.blockedPermissions`, and
   `npm run android:smoke` asserts on the **installed package** rather than the
   config, so a future drift fails a test instead of reaching a store listing.
   After any change to `app.json`, `app.config.*` or a config plugin:
   ```bash
   npx expo prebuild -p android --clean
   ```

---

## Reporting

Security issues: **support@eventerz.xyz**. Please do not open a public issue for
anything that affects live user funds or data.
