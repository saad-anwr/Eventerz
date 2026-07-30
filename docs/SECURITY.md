# Security notes

What is enforced, where, and — the part that matters more — what is **not**.

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

With RLS on and no policy present, a direct write is refused outright. That is
the mechanism — not an oversight.

Every definer function sets `search_path = public`, which is the standard defence
against search-path hijacking.

---

## Trust boundaries, stated plainly

### Wallet ownership — **verified**

Ed25519 signature over a server-minted, single-use, five-minute challenge, checked
in the `link-wallet` Edge Function, which then calls a function revoked from
`authenticated`. Full write-up in `docs/AUTH_SETUP.md`.

Before migration `0011` this was unverified, and it was the most serious hole in
the schema: claiming a well-known address granted its reputation, its ticket
history and — once payments existed — a receipt trail saying money went to a
person it did not go to.

### Payment receipts — **verified asynchronously, and labelled until then**

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

### Guest-list privacy — **enforced in Postgres**

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

### On-chain capacity — **enforced twice, on purpose**

The Anchor program checks capacity as well as Postgres. It would be reasonable to
argue the chain should trust the backend, since the backend decides who gets in.
It should not: a seat account creatable past capacity makes the on-chain record
say something the host never agreed to, and "the database would have stopped it"
is not a property anyone reading the chain can verify.

### Signatures — **never fabricated**

`MobileWalletAdapter.signAndSendTransaction` refuses an Eventerz-program intent
while no program is deployed. It used to send a zero-lamport self-transfer as a
stand-in, which produced a real, confirmable signature for a transaction that did
nothing — the UI would report a minted ticket and the explorer would appear to
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
from `authenticated` — the ones whose whole purpose is to do something the caller
must not do for themselves.

A service-role query has **no authorisation of its own**, which is the standard way
an Edge Function turns a private table into a public one. Both functions therefore
check membership explicitly: `verify-payment` refuses a receipt the caller is not
a party to, even though it read the row with a key that ignores the policy.

---

## Known gaps

Listed because an unlisted gap is a gap nobody fixes.

1. **9 npm advisories remain on the website**, all one path: `uuid@8.3.2` under
   `jayson` under `@solana/web3.js` v1. The advisory is a missing bounds check in
   `v3/v5/v6` **when the caller supplies its own buffer**; jayson only calls
   `v4()` with no buffer, so the vulnerable code is unreachable from here.
   Forcing uuid 11 would be a major bump across a CJS/ESM boundary to fix a path
   that cannot be hit — trading real breakage risk for a cosmetic audit number.
   The permanent fix is the `@solana/web3.js` v2 migration.

   The other 22 (postcss path traversal + arbitrary file read + `</style>` XSS,
   sharp's inherited libvips CVEs, brace-expansion DoS) are pinned out via
   `overrides` in `package.json`, all patch-or-minor inside the same major, with
   `next build` as the proof.

2. **No rate limiting.** Nothing throttles repeated `request_to_join` calls, or a
   stranger messaging every host on the platform. DMs are open by design; open and
   unmetered is a different thing.

3. **No host-side audit trail** for approve / decline / remove / edit decisions.
   The notifications are the only record, and they live in the recipient's row.

4. **Release APK is signed with the debug keystore.** Fine for sideloading, not
   for the dApp Store.

5. **The two hand-written Anchor clients must agree with the Rust by hand.**
   `npm run idl:sync` in the program workspace recomputes every discriminator from
   the built IDL and exits non-zero on a mismatch, and the website's test suite
   recomputes them too — but neither runs automatically yet. See the CI item in
   `HANDOFF.md`.

---

## Reporting

Security issues: **support@eventerz.xyz**. Please do not open a public issue for
anything that affects live user funds or data.
