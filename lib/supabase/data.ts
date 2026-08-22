'use client';

/**
 * Website data access.
 *
 * Mirrors the mobile app's `repositories/supabase/` so both clients hit the
 * same tables with the same semantics. Everything here is client-side: the app
 * section is interactive and realtime, so server components would only add a
 * round trip.
 */

import { SOLANA_CLUSTER } from '../solana/cluster';
import { getSupabaseBrowserClient } from './client';
import type {
  DiscoverablePersonRow,
  EventGuestRow,
  EventRow,
  FriendRequestRow,
  GuestPreview,
  MessageRow,
  NotificationRow,
  PaymentRow,
  ProfileRow,
  ProfileUpdate,
  RsvpRow,
  RsvpStatus,
  TicketRow,
} from './types';
import { PROFILE_COLUMNS } from './types';

/**
 * Make a user-typed string safe to embed in a PostgREST `.or()` filter.
 *
 * `.or()` does not take parameters - it takes a string in PostgREST's own
 * filter grammar, which the server then parses. Interpolating raw input into it
 * is the same class of mistake as string-building SQL: the value stops being a
 * value the moment it contains a character the grammar treats as syntax.
 *
 * Three characters matter:
 *   `,`  separates conditions, so it appends a new OR branch
 *   `.`  separates column / operator / value
 *   `()` groups, and `(` opens a nested boolean expression
 *
 * So a search for `x,id.eq.<uuid>` stops being a search and becomes an extra
 * disjunct. RLS still applies - `events` is restricted to `public`/`unlisted`
 * (0002), so this cannot reach a private event - which is why this is a
 * hardening fix rather than an exposed record. But "the row filter downstream
 * happens to save us" is not the reason the query should be correct, and the
 * next `.or()` someone writes may sit in front of a table without that policy.
 *
 * PostgREST's own escape hatch is double quotes around the value, with `"` and
 * `\` backslash-escaped inside. That keeps the whole thing one literal no
 * matter what it contains.
 *
 * The quotes must wrap the **whole pattern, wildcards included** -
 * `ilike."%foo%"`, not `ilike.%"foo"%`. In the second form the quotes are just
 * characters in the middle of the pattern, so it matches nothing and the search
 * box silently returns no results. Building the pattern here rather than at the
 * call site is what stops the two being assembled in the wrong order.
 */
export function postgrestLikePattern(value: string): string {
  const escaped = value.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

function client() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(error?.message ?? `${context} failed.`);
}

/* -------------------------------------------------------------------------- */
/*  Events                                                                     */
/* -------------------------------------------------------------------------- */

export type EventWithMeta = EventRow & {
  /**
   * Confirmed guests the viewer is entitled to see. Under the RLS from 0005
   * that is the host and confirmed guests; everyone else gets their own row
   * only, so this comes back holding at most themselves. Use the
   * `*_count` columns for anything numeric.
   */
  attendee_ids: string[];
  host: ProfileRow | null;
  /** The viewer's own RSVP state for this event. */
  my_status: RsvpStatus | null;
  /**
   * The viewer's 1-based place in the queue, when they are waitlisted.
   *
   * Not derivable here: RLS hands a waitlisted guest only their own row, so the
   * people ahead of them are rows this client cannot see. It comes from
   * `my_waitlist_positions`, one call for the whole page.
   */
  waitlist_position: number | null;
};

/**
 * Attach rosters, hosts and the viewer's own status.
 *
 * Three queries regardless of how many events, rather than one per event. A
 * `.select('*, host:profiles(*)')` embed would also work, but PostgREST embeds
 * come back null when RLS hides the joined row, and the host must always
 * resolve - the card is meaningless without a host name.
 */
async function hydrateEvents(rows: EventRow[]): Promise<EventWithMeta[]> {
  if (rows.length === 0) return [];

  const eventIds = rows.map((r) => r.id);
  const hostIds = Array.from(new Set(rows.map((r) => r.host_id)));

  const [{ data: rsvps }, { data: hosts }] = await Promise.all([
    // Returns the full roster for events this viewer hosts or attends, and
    // just their own row elsewhere. That asymmetry is the point: it is the
    // same query for everyone and RLS decides what it yields.
    client()
      .from('rsvps')
      .select('event_id, profile_id, status')
      .in('event_id', eventIds),
    client().from('profiles').select(PROFILE_COLUMNS).in('id', hostIds),
  ]);

  const me = await currentUserId();

  const roster: Record<string, string[]> = {};
  const mine: Record<string, RsvpStatus> = {};
  (rsvps ?? []).forEach((r) => {
    if (r.status === 'confirmed') (roster[r.event_id] ??= []).push(r.profile_id);
    if (me && r.profile_id === me) mine[r.event_id] = r.status;
  });

  const hostById = new Map((hosts ?? []).map((h) => [h.id, h]));

  /*
   * One extra round trip, and only when the viewer is actually waitlisted
   * somewhere. Asking per event would be an N+1 that grows with how patient
   * the user has been, which is a strange thing to charge them for.
   */
  const waitlisted = Object.entries(mine)
    .filter(([, status]) => status === 'waitlist')
    .map(([eventId]) => eventId);
  const positions = await waitlistPositions(waitlisted);

  return rows.map((row) => ({
    ...row,
    attendee_ids: roster[row.id] ?? [],
    host: hostById.get(row.host_id) ?? null,
    my_status: mine[row.id] ?? null,
    waitlist_position: positions[row.id] ?? null,
  }));
}

/**
 * The viewer's place in the queue for each of these events.
 *
 * A failure here is not worth failing the page over: the position is extra
 * detail on a status the guest can already see, so a null position renders the
 * generic "you are on the waitlist" line and nothing looks broken.
 */
async function waitlistPositions(
  eventIds: string[],
): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};

  const { data, error } = await client().rpc('my_waitlist_positions', {
    p_event_ids: eventIds,
  });
  if (error || !data) return {};

  return Object.fromEntries(
    (data as { event_id: string; queue_position: number }[]).map((row) => [
      row.event_id,
      row.queue_position,
    ]),
  );
}

/** The signed-in user's id, or null. Cheap - reads the cached session. */
async function currentUserId(): Promise<string | null> {
  const { data } = await client().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchEvents(options?: {
  upcomingOnly?: boolean;
  category?: string;
  query?: string;
}): Promise<EventWithMeta[]> {
  let request = client().from('events').select('*');

  if (options?.upcomingOnly) {
    request = request.gte('starts_at', new Date().toISOString());
  }
  if (options?.category && options.category !== 'All') {
    request = request.eq('category', options.category);
  }
  if (options?.query?.trim()) {
    const q = postgrestLikePattern(options.query);
    request = request.or(
      `title.ilike.${q},description.ilike.${q},location.ilike.${q}`,
    );
  }

  const { data, error } = await request.order('starts_at', { ascending: true });
  if (error) fail('Loading events', error);
  return hydrateEvents(data ?? []);
}

export async function fetchEvent(id: string): Promise<EventWithMeta | null> {
  const { data, error } = await client()
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Loading the event', error);
  if (!data) return null;
  const [hydrated] = await hydrateEvents([data]);
  return hydrated ?? null;
}

export async function fetchEventsByHost(hostId: string) {
  const { data, error } = await client()
    .from('events')
    .select('*')
    .eq('host_id', hostId)
    .order('starts_at', { ascending: false });
  if (error) fail('Loading your events', error);
  return hydrateEvents(data ?? []);
}

/**
 * Events the viewer has a live relationship with.
 *
 * Includes pending and waitlisted, not just confirmed - someone who has asked
 * to join needs somewhere to watch for the host's answer. Declined and
 * cancelled are excluded: those are closed, and listing them under "my events"
 * would read as still being in the running.
 */
export async function fetchEventsAttending(profileId: string) {
  const { data: rsvps } = await client()
    .from('rsvps')
    .select('event_id')
    .eq('profile_id', profileId)
    .in('status', ['confirmed', 'pending', 'waitlist']);

  const ids = (rsvps ?? []).map((r) => r.event_id);
  if (ids.length === 0) return [];

  const { data, error } = await client()
    .from('events')
    .select('*')
    .in('id', ids)
    .order('starts_at');
  if (error) fail('Loading your tickets', error);
  return hydrateEvents(data ?? []);
}

/* -------------------------------------------------------------------------- */
/*  Image uploads                                                             */
/* -------------------------------------------------------------------------- */

const BANNER_BUCKET = 'event-banners';
const MAX_BANNER_BYTES = 5 * 1024 * 1024;
const AVATAR_BUCKET = 'avatars';
/** 2 MB, matching the bucket's own `file_size_limit` in migration 0014. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Put an image in a storage bucket and return its public URL.
 *
 * Validated client-side for a fast, specific error; the bucket enforces the
 * same limits server-side, because a client check is a convenience and not a
 * control.
 *
 * The path is `<uid>/<random>.<ext>`: the uid prefix is what the storage policy
 * matches on (`storage.foldername(name)[1] = auth.uid()`), and the random name
 * means a new upload never overwrites the old one - which also sidesteps CDN
 * caching serving the previous image from a reused URL.
 */
async function uploadImage(
  file: File,
  profileId: string,
  bucket: string,
  maxBytes: number,
  /** What was being uploaded, for the error a failure surfaces. */
  what: string,
): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new Error('Use a JPEG, PNG, WebP or AVIF image.');
  }
  if (file.size > maxBytes) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `That image is ${mb} MB. The limit is ${maxBytes / 1024 / 1024} MB.`,
    );
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${profileId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await client()
    .storage.from(bucket)
    .upload(path, file, { cacheControl: '31536000', upsert: false });

  if (error) fail(what, error);

  const { data } = client().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Upload an event banner and return its public URL. */
export const uploadEventBanner = (file: File, profileId: string) =>
  uploadImage(
    file,
    profileId,
    BANNER_BUCKET,
    MAX_BANNER_BYTES,
    'Uploading the banner',
  );

/**
 * Upload a profile picture and return its public URL.
 *
 * The web counterpart of the app's `uploadAvatar`. It existed on mobile only,
 * which meant a picture set on a phone showed up everywhere and there was no
 * way to set one from a browser at all - the edit form simply had no control
 * for it.
 */
export const uploadAvatar = (file: File, profileId: string) =>
  uploadImage(
    file,
    profileId,
    AVATAR_BUCKET,
    MAX_AVATAR_BYTES,
    'Uploading your picture',
  );

export interface CreateEventInput {
  title: string;
  description: string;
  category: string;
  startsAt: string;
  endsAt?: string;
  location: string;
  isOnline: boolean;
  capacity: number;
  price: string;
  visibility: string;
  requiresApproval: boolean;
  tokenGated: boolean;
  tags: string[];
  coverGradient: string;
  /** Public URL from `uploadEventBanner`. The gradient shows when absent. */
  coverImage?: string;

  /**
   * Structured location, when the host picked a place rather than typing one.
   * All optional: an event with a location a geocoder never saw is still a
   * valid event, and refusing it would make the picker mandatory.
   */
  latitude?: number;
  longitude?: number;
  placeId?: string;
  address?: string;
}

export async function createEvent(input: CreateEventInput, hostId: string) {
  const { data, error } = await client()
    .from('events')
    .insert({
      title: input.title,
      description: input.description,
      host_id: hostId,
      category: input.category,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      location: input.location,
      is_online: input.isOnline,
      capacity: input.capacity,
      price: input.price,
      visibility: input.visibility,
      requires_approval: input.requiresApproval,
      token_gated: input.tokenGated,
      tags: input.tags,
      cover_gradient: input.coverGradient,
      cover_image: input.coverImage ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      place_id: input.placeId ?? null,
      address: input.address ?? null,
    })
    .select()
    .single();

  if (error) fail('Publishing the event', error);
  return data;
}

/* -------------------------------------------------------------------------- */
/*  Editing and cancelling                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Fields a host may change after publishing.
 *
 * Every field is optional and undefined means "leave alone" - the RPC treats
 * null the same way. That is what makes two devices editing the same event
 * safe: a full-row write would send back stale values for everything the user
 * did not touch and clobber the other device's change with them.
 */
export interface UpdateEventInput {
  title?: string;
  description?: string;
  category?: string;
  startsAt?: string;
  endsAt?: string | null;
  location?: string;
  isOnline?: boolean;
  capacity?: number;
  price?: string;
  visibility?: string;
  requiresApproval?: boolean;
  tags?: string[];
  coverGradient?: string;
  coverImage?: string;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  address?: string | null;
}

export async function updateEvent(
  eventId: string,
  patch: UpdateEventInput,
): Promise<EventRow> {
  const { data, error } = await client().rpc('update_event', {
    p_event_id: eventId,
    p_title: patch.title,
    p_description: patch.description,
    p_category: patch.category,
    p_starts_at: patch.startsAt,
    p_ends_at: patch.endsAt ?? undefined,
    // Null and undefined mean different things to the RPC and the same thing
    // in JS optional-property land, so clearing an end time is a separate flag.
    p_clear_ends_at: patch.endsAt === null,
    p_location: patch.location,
    p_is_online: patch.isOnline,
    p_capacity: patch.capacity,
    p_price: patch.price,
    p_visibility: patch.visibility,
    p_requires_approval: patch.requiresApproval,
    p_tags: patch.tags,
    p_cover_gradient: patch.coverGradient,
    p_cover_image: patch.coverImage,
    p_latitude: patch.latitude,
    p_longitude: patch.longitude,
    p_place_id: patch.placeId,
    p_address: patch.address,
  });

  if (error) fail('Saving your changes', error);
  return data;
}

/**
 * Call an event off.
 *
 * Soft: the row survives, every live RSVP is closed and everyone who was
 * coming is notified. Deleting would cascade to `rsvps` and `tickets` and
 * erase the attendance record of anyone who already checked in.
 */
export async function cancelEvent(
  eventId: string,
  reason?: string,
): Promise<EventRow> {
  const { data, error } = await client().rpc('cancel_event', {
    p_event_id: eventId,
    p_reason: reason?.trim() || null,
  });
  if (error) fail('Cancelling the event', error);
  return data;
}

/* -------------------------------------------------------------------------- */
/*  RSVP - request, cancel, and the host's decision                            */
/* -------------------------------------------------------------------------- */

/**
 * Ask to attend.
 *
 * The server decides the outcome - confirmed, pending approval, or waitlisted -
 * because capacity and approval have to be evaluated atomically with the seat
 * being granted. The returned status is what the UI renders, so a caller never
 * has to guess which of the three happened.
 */
export async function requestToJoin(eventId: string): Promise<RsvpRow> {
  const { data, error } = await client().rpc('request_to_join', {
    p_event_id: eventId,
  });

  /*
   * `request_to_join` refuses token-gated events with P0001 (migration 0013):
   * Postgres cannot read a token balance, so it fails closed rather than
   * admitting anyone. The gated door is an Edge Function that reads the holding
   * from the cluster first.
   *
   * Routing on the error rather than on a `token_gated` flag read earlier is
   * deliberate - the flag the client holds may be stale by exactly the race
   * that matters, a host enabling gating while someone is on the page.
   */
  if (error?.code === 'P0001') {
    const result = await joinGatedEvent(eventId);
    if (!result.joined) throw new GateError(result);
    return result.rsvp as RsvpRow;
  }

  if (error) fail('Sending your request', error);
  return data;
}

/** Why a gated join was refused, in a form the UI can render as an action. */
export interface GateRefusal {
  joined: false;
  reason: 'no-wallet' | 'insufficient' | string;
  required?: string;
  held?: string;
  detail: string;
}

type GateResult = GateRefusal | { joined: true; gated: boolean; rsvp: unknown };

export class GateError extends Error {
  readonly refusal: GateRefusal;
  constructor(refusal: GateRefusal) {
    super(refusal.detail);
    this.name = 'GateError';
    this.refusal = refusal;
  }
}

/**
 * Join a token-gated event.
 *
 * The balance is read server-side, from the wallet on the caller's profile -
 * which got there through the signed link flow (0011), so it is a wallet they
 * proved they hold rather than one they named. A client-side balance check
 * would be a suggestion, not a gate.
 */
export async function joinGatedEvent(eventId: string): Promise<GateResult> {
  const { data, error } = await client().functions.invoke('check-gate', {
    body: { eventId },
  });

  /*
   * A 403 from the function is a *refusal*, not a transport failure, and its
   * body is the reason. supabase-js raises on non-2xx, so the useful payload
   * has to be recovered from the error's response or the refusal is flattened
   * into "Edge Function returned a non-2xx status code".
   */
  if (error) {
    const body = await readFunctionBody(error);
    if (body && typeof body.reason === 'string') {
      return body as unknown as GateRefusal;
    }
    fail('Checking your holdings', error);
  }

  return data as GateResult;
}

/**
 * Mint the compressed NFT for a ticket or badge.
 *
 * Returns the `not-configured` refusal untouched rather than throwing: until a
 * Merkle tree is provisioned this is a deployment that cannot mint, which is a
 * state the UI should describe, not an error it should report.
 */
export async function mintCompressedAsset(
  kind: 'ticket' | 'badge',
  id: string,
): Promise<
  | { minted: true; assetId: string; alreadyMinted?: boolean }
  | { minted: false; reason: string; detail: string }
> {
  const { data, error } = await client().functions.invoke('mint-cnft', {
    body: { kind, id },
  });

  if (error) {
    const body = await readFunctionBody(error);
    if (body && typeof body.reason === 'string') {
      return body as unknown as { minted: false; reason: string; detail: string };
    }
    fail('Minting your asset', error);
  }

  return data;
}

export async function cancelRsvp(eventId: string): Promise<void> {
  const { error } = await client().rpc('cancel_rsvp', { p_event_id: eventId });
  if (error) fail('Cancelling your RSVP', error);
}

/** Host action: let a pending or waitlisted guest in, issuing their ticket. */
export async function approveGuest(eventId: string, profileId: string) {
  const { data, error } = await client().rpc('approve_guest', {
    p_event_id: eventId,
    p_profile_id: profileId,
  });
  if (error) fail('Approving the guest', error);
  return data;
}

/** Host action: decline a request, or remove someone already confirmed. */
export async function declineGuest(eventId: string, profileId: string) {
  const { data, error } = await client().rpc('decline_guest', {
    p_event_id: eventId,
    p_profile_id: profileId,
  });
  if (error) fail('Declining the guest', error);
  return data;
}

/**
 * The full guest list. Only returns rows for a host or a confirmed guest -
 * RLS decides, so there is no separate permission check to keep in sync here.
 */
export async function fetchEventGuests(eventId: string): Promise<EventGuestRow[]> {
  const { data, error } = await client()
    .from('event_guests')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error) fail('Loading the guest list', error);
  return data ?? [];
}

/**
 * A few faces for viewers who cannot read the roster.
 *
 * Backed by a SECURITY DEFINER function so it can sample rows the caller
 * cannot select, bounded server-side so it cannot be walked to reconstruct
 * the full list.
 */
export async function fetchGuestPreview(
  eventId: string,
  limit = 3,
): Promise<GuestPreview[]> {
  const { data, error } = await client().rpc('event_guest_preview', {
    p_event_id: eventId,
    p_limit: limit,
  });
  if (error) fail('Loading who is going', error);
  return (data as GuestPreview[] | null) ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                              */
/* -------------------------------------------------------------------------- */

export async function fetchNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await client()
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) fail('Loading notifications', error);
  return data ?? [];
}

/** Mark everything read. RLS scopes the update to the caller's own rows. */
export async function markNotificationsRead(profileId: string): Promise<void> {
  const { error } = await client()
    .from('notifications')
    .update({ read: true })
    .eq('profile_id', profileId)
    .eq('read', false);
  if (error) fail('Updating notifications', error);
}

/* -------------------------------------------------------------------------- */
/*  People & friends                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Everyone except the viewer, with the friendship state attached.
 *
 * This is what was broken: the page previously read a hard-coded array of demo
 * users, so real signups were invisible no matter how many people joined.
 */
export async function fetchDiscoverablePeople(): Promise<
  DiscoverablePersonRow[]
> {
  const { data, error } = await client()
    .from('discoverable_people')
    .select('*')
    .order('reputation', { ascending: false })
    .limit(60);
  if (error) fail('Loading people', error);
  return data ?? [];
}

export async function fetchFriendRequests(
  profileId: string,
): Promise<FriendRequestRow[]> {
  const { data, error } = await client()
    .from('friend_requests')
    .select('*')
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);
  if (error) fail('Loading friend requests', error);
  return data ?? [];
}

export async function fetchFriends(profileId: string): Promise<ProfileRow[]> {
  const requests = await fetchFriendRequests(profileId);
  const ids = requests
    .filter((r) => r.status === 'accepted')
    .map((r) => (r.requester_id === profileId ? r.addressee_id : r.requester_id));

  if (ids.length === 0) return [];

  const { data } = await client().from('profiles').select(PROFILE_COLUMNS).in('id', ids);
  return data ?? [];
}

export async function sendFriendRequest(requesterId: string, addresseeId: string) {
  const { error } = await client()
    .from('friend_requests')
    .insert({ requester_id: requesterId, addressee_id: addresseeId });
  // A duplicate just means they already asked - not worth surfacing.
  if (error && error.code !== '23505') fail('Sending the request', error);
}

export async function respondToFriendRequest(id: string, accept: boolean) {
  const { error } = await client()
    .from('friend_requests')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', id);
  if (error) fail('Responding to the request', error);
}

export async function fetchProfile(id: string): Promise<ProfileRow | null> {
  const { data } = await client()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  return data;
}

/**
 * The signed-in user's own phone number, or null.
 *
 * Lives in `profile_private` rather than on `profiles`, because `profiles` is
 * world-readable and a phone number is at least as identifying as the email
 * that 0015 went out of its way to stop publishing. RLS on that table is keyed
 * to `auth.uid()`, so this can only ever return the caller's own row - there is
 * no id parameter because there is nothing else it could fetch.
 */
export async function fetchMyPhone(): Promise<string | null> {
  const { data, error } = await client()
    .from('profile_private')
    .select('phone')
    .maybeSingle();

  /*
   * A missing row is the normal state for anyone who has never saved a number,
   * and `maybeSingle` returns null data without an error for it. A real error
   * is reported rather than swallowed, so a broken read does not look like an
   * empty field the user is invited to fill in again.
   */
  if (error) fail('Loading your contact details', error);
  return data?.phone ?? null;
}

/**
 * Save the phone number.
 *
 * Upsert, because the row does not exist until the first save and the editor
 * has no way to know which case it is in - and should not have to.
 *
 * An empty string is stored as null rather than "": they mean the same thing to
 * a reader, and only one of them is what "I have no phone number" looks like in
 * a database.
 */
export async function saveMyPhone(
  profileId: string,
  phone: string,
): Promise<void> {
  const trimmed = phone.trim();
  const { error } = await client()
    .from('profile_private')
    .upsert(
      { id: profileId, phone: trimmed || null },
      { onConflict: 'id' },
    );
  if (error) fail('Saving your contact details', error);
}

/**
 * Start the X account link.
 *
 * `linkIdentity` attaches an OAuth identity to the *existing* signed-in user
 * rather than creating a second account, which is what makes this a proof of
 * ownership instead of another way to log in. It navigates away to X, so
 * nothing after it runs - the result is picked up on the way back by
 * `syncXIdentity`.
 *
 * Requires the Twitter provider **and** "Manual linking" to be enabled on the
 * Supabase project; both are dashboard settings, not code.
 */
export async function startXLink(returnTo: string): Promise<void> {
  const { error } = await client().auth.linkIdentity({
    provider: 'twitter',
    options: { redirectTo: returnTo },
  });
  if (error) throw new Error(error.message);
}

/**
 * Adopt the handle from the linked X identity.
 *
 * The handle is read server-side from `auth.identities` (migration 0020), so
 * this passes no arguments - there is nothing the client could send that would
 * be worth trusting. Returns the updated profile.
 */
export async function syncXIdentity(): Promise<ProfileRow> {
  const { data, error } = await client().rpc('sync_x_identity');
  if (error) fail('Confirming your X account', error);

  /*
   * Checked rather than cast. `sync_x_identity` is declared `returns
   * public.profiles` - a bare composite, which Postgres answers with exactly
   * one row, all columns NULL when the inner select matched nothing. PostgREST
   * reports that as an object, so `data` is truthy and the cast type-checks
   * while handing back a profile whose `id` is null.
   *
   * That exact shape crashed wallet onboarding in the mobile app (see the
   * header of migration 0024). Here it would quietly replace a real profile
   * with an empty one, so it throws instead - `fail` is already how every other
   * error in this module surfaces.
   */
  const row = data as Partial<ProfileRow> | null;
  if (!row || typeof row.id !== 'string' || row.id.length === 0) {
    fail('Confirming your X account', null);
  }
  return row as ProfileRow;
}

/** True when this login already has an X identity attached. */
export async function hasXIdentity(): Promise<boolean> {
  const { data, error } = await client().auth.getUserIdentities();
  if (error) return false;
  return (data?.identities ?? []).some((i) => i.provider === 'twitter');
}

export async function updateProfile(
  id: string,
  patch: ProfileUpdate,
): Promise<ProfileRow> {
  const { data, error } = await client()
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) fail('Saving your profile', error);
  return data;
}

export async function fetchProfiles(ids: string[]): Promise<ProfileRow[]> {
  if (ids.length === 0) return [];
  const { data } = await client().from('profiles').select(PROFILE_COLUMNS).in('id', ids);
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                   */
/* -------------------------------------------------------------------------- */

/** Canonical DM key - sorted so both participants derive the same channel. */
export function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join('__')}`;
}

export interface Conversation {
  user: ProfileRow;
  last: MessageRow | null;
  /**
   * Distinguishes a thread with a friend from one opened by "Contact host".
   * The inbox labels the second kind, because an unexplained stranger in an
   * inbox reads as spam.
   */
  isFriend: boolean;
}

/**
 * The inbox: everyone the viewer can talk to, newest thread first.
 *
 * The set is friends **union** everyone who has actually messaged them. It
 * used to be friends alone, which meant a host contacted through "Contact
 * host" - by definition someone they are not friends with - received the
 * message into a thread that appeared nowhere. The message arrived, was
 * readable, and was invisible.
 *
 * Friends with no messages are still listed: an empty thread with someone you
 * know is a starting point, and hiding it turns "message a friend" into a
 * search problem.
 *
 * Four queries regardless of how many people are involved.
 */
export async function fetchConversations(
  profileId: string,
): Promise<Conversation[]> {
  const [friends, { data: partners }] = await Promise.all([
    fetchFriends(profileId),
    client().rpc('my_dm_partners'),
  ]);

  const ids = new Set(friends.map((f) => f.id));
  (partners ?? []).forEach((p) => {
    if (p.profile_id && p.profile_id !== profileId) ids.add(p.profile_id);
  });
  if (ids.size === 0) return [];

  const known = new Map(friends.map((f) => [f.id, f]));
  const missing = Array.from(ids).filter((id) => !known.has(id));
  (await fetchProfiles(missing)).forEach((p) => known.set(p.id, p));

  const channels = Array.from(ids).map((id) => dmChannelId(profileId, id));

  const { data: rows } = await client()
    .from('messages')
    .select('*')
    .in('channel_id', channels)
    .order('created_at', { ascending: false });

  // Rows arrive newest-first, so the first hit per channel is the latest.
  const latest = new Map<string, MessageRow>();
  (rows ?? []).forEach((m) => {
    if (!latest.has(m.channel_id)) latest.set(m.channel_id, m);
  });

  return Array.from(ids)
    .map((id) => known.get(id))
    .filter((user): user is ProfileRow => Boolean(user))
    .map((user) => ({
      user,
      last: latest.get(dmChannelId(profileId, user.id)) ?? null,
      isFriend: known.has(user.id) && friends.some((f) => f.id === user.id),
    }))
    .sort((a, b) => {
      const at = a.last ? Date.parse(a.last.created_at) : 0;
      const bt = b.last ? Date.parse(b.last.created_at) : 0;
      return bt - at;
    });
}

export async function fetchMessages(channelId: string): Promise<MessageRow[]> {
  const { data, error } = await client()
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) fail('Loading messages', error);
  return data ?? [];
}

export async function sendMessage(
  channelId: string,
  senderId: string,
  body: string,
  scope: 'event' | 'dm' = 'dm',
) {
  const trimmed = body.trim();
  if (!trimmed) return;

  const { error } = await client()
    .from('messages')
    .insert({ channel_id: channelId, sender_id: senderId, body: trimmed, scope });
  if (error) fail('Sending the message', error);
}

/* -------------------------------------------------------------------------- */
/*  Payments                                                                   */
/* -------------------------------------------------------------------------- */

export interface RecordPaymentInput {
  /** The confirmed transaction signature. Unique - retrying is safe. */
  signature: string;
  toWallet: string;
  /** Base units. Lamports for SOL. */
  amount: bigint;
  channelId?: string;
  toProfile?: string;
  memo?: string;
  mint?: string;
  symbol?: string;
  decimals?: number;
  cluster?: string;
}

/**
 * File the receipt for a transfer that has already confirmed.
 *
 * Called *after* the chain has accepted the transaction, never before: a
 * receipt for a transfer that has not landed is a lie the recipient acts on.
 * The RPC posts the message into the thread in the same transaction, so a
 * receipt cannot exist without something rendering it.
 */
export async function recordPayment(
  input: RecordPaymentInput,
): Promise<PaymentRow> {
  const { data, error } = await client().rpc('record_payment', {
    p_signature: input.signature,
    p_to_wallet: input.toWallet,
    // PostgREST accepts a numeric string for `bigint`, which is the only way
    // to send a value above 2^53 without losing precision on the way.
    p_amount: input.amount.toString(),
    p_channel_id: input.channelId ?? null,
    p_to_profile: input.toProfile ?? null,
    p_memo: input.memo ?? null,
    p_mint: input.mint ?? null,
    p_symbol: input.symbol ?? 'SOL',
    p_decimals: input.decimals ?? 9,
    p_cluster: input.cluster ?? SOLANA_CLUSTER,
  });

  if (error) fail('Saving the receipt', error);
  return data;
}

/** Receipts referenced by the messages in a thread. */
export async function fetchPayments(ids: string[]): Promise<PaymentRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client()
    .from('payments')
    .select('*')
    .in('id', ids);
  if (error) fail('Loading receipts', error);
  return data ?? [];
}

/**
 * Ask the Edge Function to check a receipt against the cluster.
 *
 * Best-effort by design. A receipt that has not been verified renders with its
 * explorer link and no tick, which is honest and useful; blocking the UI on an
 * RPC that may not have seen the transaction yet is neither.
 */
export async function verifyPayment(signature: string): Promise<boolean> {
  const supabase = client();
  const { data, error } = await supabase.functions.invoke('verify-payment', {
    body: { signature },
  });
  if (error) return false;
  return Boolean((data as { verified?: boolean } | null)?.verified);
}

/* -------------------------------------------------------------------------- */
/*  Newsletter                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Add an address to the newsletter list.
 *
 * Works signed-out - the form lives in the marketing footer. Idempotent and
 * silent about whether the address was already there, so a caller cannot use it
 * to test who is subscribed; the UI therefore shows the same confirmation
 * either way, which is also the truthful answer to "am I on the list?".
 *
 * # Why this goes through an Edge Function rather than `rpc()`
 *
 * It used to call `subscribe_newsletter` directly. That function is safe to
 * expose to `anon` and rate-limits three attempts an hour **per address** - but
 * the subject that matters for an anonymous form is the caller's IP, and
 * Postgres cannot see it: PostgREST terminates the connection, so the database
 * only ever sees its own client. A flood that varies the address each time -
 * which is every real signup-spam wave - walked straight past the limit.
 *
 * `subscribe-newsletter` sees `x-forwarded-for` and keys on it. The per-address
 * limit stays in the database, because the two catch different attacks.
 */
export async function subscribeToNewsletter(
  email: string,
  source = 'website',
): Promise<void> {
  const { error } = await client().functions.invoke('subscribe-newsletter', {
    body: { email, source },
  });

  if (error) {
    /*
     * `FunctionsHttpError.message` is always "Edge Function returned a non-2xx
     * status code" - the sentence worth showing is in the response body, which
     * the function writes for exactly this purpose. Without this, being rate
     * limited reads as a generic failure and the user retries into it.
     */
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      try {
        const body = await response.json();
        if (typeof body?.error === 'string') throw new Error(body.error);
      } catch (parsed) {
        if (parsed instanceof Error && parsed.message) throw parsed;
      }
    }
    fail('Subscribing', error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Wallet ownership                                                           */
/* -------------------------------------------------------------------------- */

/*
 * Linking a wallet - issuing the challenge and submitting the signature - lives
 * in `auth-service.ts` (`linkWallet`), next to the rest of the identity
 * surface. This file used to carry a second implementation of the same two
 * steps; the one that shipped was always the auth-service one.
 */

/** One wallet on the signed-in account. */
export type LinkedWallet = {
  address: string;
  isPrimary: boolean;
  label: string | null;
  linkedAt: string;
};

/**
 * Every wallet linked to the signed-in account, primary first.
 *
 * An account holds a set of wallets since migration 0022, not one. Anything
 * that used `profiles.wallet_address` as "is this wallet linked?" answers no
 * for every wallet except the primary - and the auto-link path responded to
 * that "no" by asking for another signature, for a wallet that was already
 * linked.
 */
export async function myWallets(): Promise<LinkedWallet[]> {
  const { data, error } = await client().rpc('my_wallets');
  if (error) return [];

  return (data ?? []).map((row) => ({
    address: row.address,
    isPrimary: row.is_primary,
    label: row.label,
    linkedAt: row.linked_at,
  }));
}

/**
 * Detach one wallet, leaving the account and its other wallets intact.
 *
 * Omitting the address detaches the primary, which is what this meant when an
 * account could hold only one.
 */
export async function unlinkWallet(
  walletAddress?: string,
): Promise<ProfileRow> {
  const { data, error } = walletAddress
    ? await client().rpc('unlink_wallet_address', {
        p_wallet_address: walletAddress,
      })
    : await client().rpc('unlink_wallet');

  if (error) fail('Unlinking your wallet', error);
  return data;
}

/* -------------------------------------------------------------------------- */
/*  Check-in                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Redeem a ticket at the door. Host only, enforced by the server.
 *
 * The website had no check-in path at all: a host whose phone was flat, or who
 * ran the door from a laptop, had no way to admit anybody. Now that a ticket QR
 * carries an `https://.../checkin?...` URL, any camera on any phone resolves to
 * the page that calls this - which is the point of moving off the custom
 * scheme.
 *
 * Every check that matters is in `check_in_ticket` (migration 0002): the secret
 * must match, the caller must host the event, and a ticket can be redeemed
 * once. None of that is re-implemented here, and none of it can be skipped by
 * calling this differently.
 */
export async function checkInTicket(
  ticketId: string,
  qrSecret: string,
): Promise<TicketRow> {
  const { data, error } = await client().rpc('check_in_ticket', {
    p_ticket_id: ticketId,
    p_qr_secret: qrSecret,
  });
  if (error) fail('Checking this guest in', error);
  return data;
}

/** Promote one of the account's wallets to primary. */
export async function setPrimaryWallet(
  walletAddress: string,
): Promise<ProfileRow> {
  const { data, error } = await client().rpc('set_primary_wallet', {
    p_wallet_address: walletAddress,
  });
  if (error) fail('Setting your main wallet', error);
  return data;
}

/**
 * The response body behind a `FunctionsHttpError`.
 *
 * supabase-js throws before the caller sees the body, and `error.message` is
 * always "Edge Function returned a non-2xx status code". Every Edge Function
 * here answers a refusal with a structured reason - `check-gate` says which
 * holding was short, `mint-cnft` says minting is not configured - and all of
 * that is in the body or nowhere.
 */
async function readFunctionBody(
  error: unknown,
): Promise<Record<string, unknown> | null> {
  const response = (error as { context?: Response })?.context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
