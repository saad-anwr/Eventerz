# Guest flow — requests, approval and the guest list

How someone goes from "interested" to "holding a ticket", who can see whom, and
where each rule is enforced. The website and the mobile app both drive the same
Postgres functions, so the behaviour described here is identical on both.

---

## Apply the migrations first

Run these in order in the Supabase SQL editor. Each is safe to re-run.

| File | What breaks without it |
| --- | --- |
| `0001_profiles.sql` | No accounts at all. |
| `0002_events.sql` | No events, tickets or RSVPs. |
| `0003_social_and_rls_fix.sql` | `events`/`rsvps`/`tickets` return **HTTP 500** (recursive RLS), no friends, no messages, nothing realtime. |
| `0004_event_banners.sql` | Banner upload on `/create` fails. |
| `0005_approval_and_guest_list.sql` | RSVP does nothing, no approval flow, guest counts read 0. |

`0005` adds one enum value (`declined`). A new enum value cannot be *used* in
the same transaction that adds it — nothing in the file does, but if your SQL
client wraps the whole script in a transaction and objects, run that first
statement alone, then the rest.

---

## The states

An RSVP is one row in `rsvps`, unique per (event, person).

| Status | Meaning | Holds a seat? | Ticket? |
| --- | --- | --- | --- |
| `confirmed` | Going. | Yes | Yes |
| `pending` | Asked to join, waiting on the host. | No | No |
| `waitlist` | Event was full when they asked. | No | No |
| `declined` | The host said no. | No | No |
| `cancelled` | The guest withdrew. | No | No |

Capacity counts **confirmed only**. Pending requests deliberately do not hold
seats — otherwise anyone could fill an event by requesting and never being
approved.

## Requesting

`request_to_join(event_id)` decides the outcome server-side, in this order:

1. Already `confirmed`/`pending`/`waitlist` → returns that, unchanged. A
   double-tap is harmless.
2. Event full → `waitlist`.
3. Event requires approval → `pending`, and the **host** is notified.
4. Otherwise → `confirmed`, and a ticket is issued.

The client renders whatever status comes back, so the button never promises an
outcome the server did not produce.

**A wallet is not required to request.** It is recorded when present and is
required to mint an on-chain ticket, but it does not gate asking to attend.
(`rsvp()` in `0002` did require one and raised `42501` otherwise, which is why a
Google-only account could click RSVP and have nothing happen.)

## Host decisions

- `approve_guest(event_id, profile_id)` — `pending`/`waitlist` → `confirmed`,
  issues the ticket at that moment, notifies the guest. Refuses if the event is
  already at capacity.
- `decline_guest(event_id, profile_id)` — → `declined`, deletes any ticket,
  notifies the guest. If they had been confirmed, the freed seat triggers
  waitlist promotion. The same function handles "decline a request" and "remove
  a confirmed guest" because they are the same host intent.

Both re-check `host_id = auth.uid()` inside the function. Rendering the host
panel is not what authorises anything.

## Waitlist promotion

`promote_from_waitlist(event_id)` runs whenever a confirmed seat is freed —
a guest cancelling, or the host removing someone. The longest-waiting person is
pulled in.

If the event **requires approval**, they become `pending` rather than
`confirmed`, and the host is notified. Silently admitting someone would override
the host's decision to vet every guest.

## Who can see the guest list

| Viewer | Sees |
| --- | --- |
| Host | Every RSVP, including declined and cancelled. |
| Confirmed guest | The other **confirmed** guests. |
| Anyone else | Counts, plus up to 3 sample faces. |

Enforced by RLS on `rsvps`, not by the UI. A confirmed guest is restricted to
`confirmed` rows on purpose: a declined request is between that person and the
host, and letting fellow guests enumerate rejections would publish the host's
moderation.

The preview comes from `event_guest_preview()`, a `SECURITY DEFINER` function so
it can sample rows the caller cannot select. Its limit is clamped to `[0, 12]`
server-side, so a caller cannot widen it and page out the full roster.

### Counts are columns, not aggregates

`events.confirmed_count`, `pending_count`, `waitlist_count` and
`checked_in_count` are maintained by trigger. Three reasons:

1. A stranger must see "42 going" without being able to list the 42. Counting
   client-side from rows RLS hides would report 0.
2. List pages stop querying the roster entirely.
3. `events` already streams over Realtime, so the numbers move live for every
   viewer without a second subscription.

The trigger does a full recount per event rather than incremental arithmetic:
statuses can move between any two values, and a recount is self-healing — a
wrong counter fixes itself on the next write.

## Writes never come from the client

There are **no INSERT or UPDATE policies on `rsvps`**. Every write goes through
the `SECURITY DEFINER` functions above, which bypass RLS and so need no policy;
with none present, a direct client write is refused.

This is deliberate. `0002` had a self-write policy, which let anyone run
`update rsvps set status = 'confirmed'` and walk past capacity, approval and
ticket allocation. A cancel-only UPDATE policy has the same hole — RLS restricts
*which rows* you may touch, never *which values* you may set.

## Event chat

Gated to the host and `confirmed` guests via `can_access_channel()`. `0003`
admitted anyone with a non-cancelled RSVP, which included pending requests —
someone the host had not yet accepted, and might decline, could read and post in
the attendee channel.

## Notifications

Every state change writes a row to `notifications`, from inside the SQL
functions rather than from either client, so both parties are notified even when
the other is offline:

| Event | Who hears |
| --- | --- |
| Request received | Host |
| Waitlisted | Guest |
| Confirmed immediately | Guest |
| Approved | Guest |
| Declined / removed | Guest |
| Promoted off the waitlist | Guest |
| Seat freed on an approval-gated event | Host |

The bell in the app shell subscribes to the table, so the host's decision
reaches the guest without a refresh.

---

# Additions since the approval pipeline

Everything above still holds. This section covers what `0006`–`0011` added.

## Waitlist position

A waitlisted guest sees their place in the queue — "#3 of 12 waiting".

It cannot be computed on the client. The RLS above hands a waitlisted guest
exactly one RSVP row, their own, so counting the people ahead of them means
counting rows they may not read. `my_waitlist_position(event_id)` is a
`SECURITY DEFINER` function that returns **one integer about the caller** and
nothing about who else is in the queue.

`my_waitlist_positions(event_id[])` is the batch form, so a "my events" list
costs one call rather than one per waitlisted event.

The ordering — `created_at, profile_id` — is identical to
`promote_from_waitlist`. That is a contract between them, not an implementation
detail: if the two disagreed, the app would promise a seat to the wrong person.

`promote_from_waitlist` also notifies whoever inherits first place, once.
Notifying the whole queue on every movement would send the fortieth person forty
notifications to say they are still fortieth.

## Editing and cancelling  (`0007`)

| Function | Who | What it does |
| --- | --- | --- |
| `update_event(...)` | Host | Writes a fixed column list; notifies live guests on a move or a time change |
| `cancel_event(id, reason)` | Host | Soft-cancels, closes every live RSVP, notifies everyone |

Both are functions rather than direct UPDATEs even though RLS already restricted
event writes to the host, for three reasons:

1. RLS controls *which rows* you may write, never *which columns* or *which
   values*. A direct UPDATE let a host rewrite `confirmed_count` to 500, or set
   `host_id` to someone else.
2. Notifying guests has to happen in the same transaction as the edit.
   Client-side it becomes an edit that lands with nobody told, whenever the tab
   closes between the two calls.
3. Lowering capacity below the headcount has to be a decision, not a silent
   corruption. The function refuses it.

Every parameter defaults to null, and null means "leave alone", so a client sends
only what it is changing. That is what makes two devices editing the same event
safe — a full-row write would clobber the other device's change with a stale
value it never intended to send. `p_ends_at` is the exception: an event can
legitimately lose its end time, so `p_clear_ends_at` distinguishes "unchanged"
from "cleared".

**Cancellation is soft.** The row survives so ticket holders keep the record and
the URL still resolves; a dead link where an event used to be is a worse answer
than a page saying it was called off. Deleting would cascade to `rsvps` and
`tickets` and erase the attendance of everyone who already checked in. Guests are
moved to `cancelled` rather than `declined` — `declined` means the host rejected
*that person*, and telling forty people they were individually turned down is the
wrong story.

`request_to_join` refuses a cancelled event, and so does `update_event`.

## Reminders  (`0010`)

Two windows, 24 hours and 1 hour, answering different questions: "is this still
happening, and do I need to arrange anything?" and "leave now."

In the database via `pg_cron`, not a Vercel cron route, because one
implementation then serves both clients — both already render `notifications` and
already stream that table over Realtime. The mobile app's local scheduler fires
only on the phone that RSVP'd and never for someone who signed up on the website;
a web-only cron could never reach the app.

Idempotent **by construction**: the job inserts a claim row into
`event_reminders` first, and a unique constraint is what stops a second send.
Checking "did I already notify?" with a SELECT and then inserting is a race that
duplicates every reminder the moment two workers overlap — and overlap is the
normal state of a cron job whose previous run has not finished. So the job can run
every fifteen minutes safely.

Only **confirmed** guests are reminded. Someone still pending approval has not
been told they are coming, and "your event starts in an hour" would be the app
telling them they are in — a decision the host has not made.

Guests who RSVP'd within the last hour are skipped for the 24-hour window.
Otherwise someone who RSVPs at 18:01 to a tomorrow-evening event is told "this is
tomorrow" at 18:15, about something they are still looking at.

## Contacting a host  (`0009`)

DMs were already open to any two profiles: `can_access_channel` requires only
that you are a party to the channel. What was missing was the **inbox** — it was
derived from the friend list, so a message from a non-friend arrived in a thread
that appeared nowhere. It was delivered, readable, and invisible.

`my_dm_partners()` returns everyone the caller has an actual DM thread with. The
inbox is now that set **union** friends, so friends with no messages still appear
(an empty thread with someone you know is a starting point) and strangers are
labelled, because an unexplained name in an inbox reads as spam.

The website's DM screen also used to disable its composer unless you were
friends — a UI gate that contradicted the database, since the message would have
sent fine.

## Payments in a thread  (`0009`)

The money moves on-chain; the receipt lands in the thread. The chain is the source
of truth for *whether it happened*; `payments` is the source of truth for *what it
was for* and *who it was between*, which the chain does not know — it sees two
base58 strings, not two people.

Order of operations, and it only works one way round:

1. Build and send the transfer.
2. Wait for the cluster to confirm it.
3. `record_payment(...)` — writes the row **and** posts the receipt message in one
   transaction.

Recording first is tempting because it gives the UI something to render
immediately, and it is wrong: a receipt for a transfer that then fails is a lie
the recipient acts on. `record_payment` is idempotent on the signature, so the
failure mode of this ordering is benign — if the app dies between confirmation
and recording, the money moved and the receipt is missing, and calling again with
the same signature files it exactly once.

### What is enforced, and what is not

`record_payment` **cannot** verify the signature: Postgres makes no outbound RPC
calls. So:

- Receipts are written `verified = false`.
- Every surface renders an unverified receipt with a clock and no tick. An
  unchecked claim must not look like a checked one, or the tick becomes
  decorative.
- The `verify-payment` Edge Function checks the recipient's **balance delta**
  against the cluster and calls `mark_payment_verified`, which is revoked from
  `authenticated` — the party who benefits from the flag cannot set it.

A balance delta rather than an instruction walk, because reading the instruction
list means understanding every program that might have moved the money. Before
and after is the same question with one answer regardless of route. The check is
`>=`, not `==`: the recipient may legitimately have gained more in the same
transaction, and a receipt claiming *less* than moved is not a lie worth blocking.

What `record_payment` *does* enforce is the part a lie would profit from:

- You may only record a payment as yourself (`auth.uid()`).
- If you name a recipient profile, that profile's wallet must be the wallet that
  was actually paid. Without this, anyone could take a real signature off the
  explorer and record it as "I paid you".
- The receipt message is written **by the function**. `messages`'s insert policy
  pins client writes to `kind = 'text'` with a null `payment_id`, so a client
  cannot post a receipt for a transfer that never happened.

Amounts are `bigint` base units end to end — never floats. `0.1 + 0.2 !== 0.3`
in binary floating point, and a lamport value above ~9 million SOL already
exceeds `Number.MAX_SAFE_INTEGER`. PostgREST serialises `bigint` as a string for
exactly that reason; parse it with `BigInt`, never `Number`.

## Wallet ownership  (`0011`)

`link_wallet` took an address and wrote it to the caller's profile. It checked
that no *other* profile had claimed that address, and nothing else — so any
signed-in user could link any wallet they could read off the explorer, along with
its reputation, its ticket history and, once payments existed, a receipt trail
saying money went to a person it did not go to.

The check it skipped is the only one that matters: **does this caller hold the
private key?**

1. `issue_wallet_link_nonce(address)` mints a single-use challenge bound to the
   caller *and* the address, valid five minutes. It returns the full message text,
   not a bare nonce — a wallet popup showing an opaque UUID teaches users to
   approve opaque UUIDs, which is the habit every signature-phishing attack
   depends on.
2. The wallet signs that exact text. Free, and touches no chain.
3. The `link-wallet` Edge Function verifies the Ed25519 signature, then calls
   `link_wallet_verified(profile, address, nonce)` with the service-role key.

The nonce is passed back in step 3 on purpose: the function verified a signature
over a *specific challenge*, and handing that challenge to the database is what
ties the verification to the row it writes. It is then consumed — deleted, not
flagged — so the same signature cannot be presented twice. Verifying a signature
over an attacker-chosen message proves they can sign; it does not prove they were
answering our challenge, and a signature harvested from any other Solana dapp
would otherwise sail straight through.

`link_wallet_verified` is revoked from `authenticated`. `link_wallet` still
exists — dropping it would break installed mobile builds with a confusing
"function does not exist" — but now raises a message pointing at the Edge
Function.

`unlink_wallet()` exists because linking became a deliberate act: a user who links
the wrong wallet, or loses the key, needs a way back that does not involve
deleting their account and their attendance history with it.

## Testing this

The whole flow above is Postgres, so its suite is SQL:

```bash
supabase start && supabase db reset
npm run test:db          # supabase/tests/guest_flow_test.sql
```

Eleven sections, run as several different users via `set local role` plus a forged
`request.jwt.claims` — the same mechanism PostgREST uses, so the policies see
exactly what they see in production. Half the assertions are about what a user
*cannot* see or do, which is not expressible from a single-user client. It all
runs in one transaction and rolls back.

The TypeScript suites (`npm test` in each project) cover the pure logic either
side of it: the state machine, the wording, lamport arithmetic and the Anchor
instruction encoding.
