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

## Secrets in git history - **rotation outstanding**

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

As of 4 Aug 2026 the leaked key is **still the value configured in
`Eventerz dApp/.env` and `Eventerz/.env.local`, and still answers requests** -
checked directly with `getHealth`, which returned `ok`. Everything fixable in the
codebase has been fixed; this is the part that needs the dashboard.

Rotation itself cannot be automated: a Helius RPC key grants RPC scope only, with
no account-management capability, so creating and revoking keys is possible only
from an authenticated dashboard session. Everything downstream of those two
clicks is: `npm run rotate:helius -- <new-key>` from `C:\Eventerz` validates the
replacement against mainnet before writing it, updates both `.env` files, and
prints the EAS and Vercel commands. It refuses the leaked key by hash, and writes
nothing if the new key fails to authenticate.

The delivery mechanism is worth naming, because it will still be running after
this is fixed: an automated process commits and pushes all three repositories on
a timer (`update_DD/MM_HH:MM`). Nothing reviews a diff first, so anything written
into a working tree is public within minutes. `.gitignore` was therefore the only
control before publication - and it only ever covers paths somebody predicted.

### What now stands in the way

| Control | Where | Effect |
| --- | --- | --- |
| Pre-commit credential scan | `.githooks/pre-commit` -> `scripts/check-secrets.mjs`, **both repos** | Refuses a commit containing a key, a JWT, a private-key block or a signing artefact. Scans inside binaries too - the APK leaked because a key compiled into a bundle is plain ASCII inside the file. Override: `ALLOW_SECRETS=1` |
| Production build gate | `lib/env.ts` | `next build` fails while `NEXT_PUBLIC_HELIUS_RPC_URL` carries the leaked key. Override: `ALLOW_COMPROMISED_RPC_KEY=1` |
| Mainnet readiness gate | `Eventerz dApp/scripts/check-mainnet.mjs` | `npm run check:mainnet` exits non-zero on the same condition |

Both gates match a **SHA-256** of the key rather than the key: these files are
committed, and committing the value again is the whole mistake. A 128-bit key
behind SHA-256 is not recoverable from the hash, but an exact match is
detectable, which is all the check needs. Delete both constants once rotation is
confirmed.

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

### Why a client-side RPC key cannot be fixed by hiding it

`NEXT_PUBLIC_` and `EXPO_PUBLIC_` values are inlined into the bundle at build
time. The Helius URL is therefore extractable from any published web bundle or
APK - `unzip -p app.apk | grep api-key` is the whole attack. EAS's
`--visibility sensitive` keeps it out of build logs and the dashboard, which is
worth having, but it does not keep it out of the artifact.

So the control is economic rather than cryptographic: a spend cap plus a
domain/bundle restriction on the key. Rotation closes this incident; the cap is
what bounds the next one. Proxying RPC through an Edge Function is the only way
to actually hide it, and is worth doing if usage ever justifies the added hop.

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

6. **The public RPC is the fallback on both platforms.** With
   `NEXT_PUBLIC_HELIUS_RPC_URL` / `EXPO_PUBLIC_HELIUS_RPC_URL` unset, both fall
   back to `api.mainnet-beta.solana.com`, which is shared, aggressively
   rate-limited, and explicitly not intended for production traffic. It works in
   testing and degrades under load in the worst possible place: balance reads
   fail and a transfer sits at "confirming" while the user wonders whether their
   money moved. **Set a dedicated RPC before launch.**

7. ~~**`Eventerz Program/` is not under version control.**~~ Fixed - the folder
   is now a git repo with an initial commit and a `.gitattributes` pinning LF,
   so the Rust that builds under WSL2 does not churn against CRLF checkouts.

8. **The generated Android project can drift from `app.json`, silently.**
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
