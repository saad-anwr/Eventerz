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
