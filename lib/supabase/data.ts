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
} from './types';
import { PROFILE_COLUMNS } from './types';

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
    const q = `%${options.query.trim()}%`;
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
/*  Banner upload                                                              */
/* -------------------------------------------------------------------------- */

const BANNER_BUCKET = 'event-banners';
const MAX_BANNER_BYTES = 5 * 1024 * 1024;
const BANNER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Upload an event banner and return its public URL.
 *
 * Validated client-side for a fast, specific error; the bucket enforces the
 * same limits server-side, because a client check is a convenience and not a
 * control.
 *
 * The path is `<uid>/<random>.<ext>` - the uid prefix is what the storage
 * policy checks, and the random name avoids one upload clobbering another.
 */
export async function uploadEventBanner(
  file: File,
  profileId: string,
): Promise<string> {
  if (!BANNER_TYPES.includes(file.type)) {
    throw new Error('Use a JPEG, PNG, WebP or AVIF image.');
  }
  if (file.size > MAX_BANNER_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`That image is ${mb} MB. The limit is 5 MB.`);
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${profileId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await client()
    .storage.from(BANNER_BUCKET)
    .upload(path, file, { cacheControl: '31536000', upsert: false });

  if (error) fail('Uploading the banner', error);

  const { data } = client().storage.from(BANNER_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

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
 * The entry requirement, for rendering before anyone tries to join.
 *
 * `gate_min_amount` arrives as a string because it is `numeric(40,0)` - PostgREST
 * would hand a JS client a lossy Number for anything past 2^53, and this is the
 * same money-is-integers rule the rest of the codebase follows.
 */
export async function getEventGate(eventId: string) {
  const { data, error } = await client().rpc('event_gate', {
    p_event_id: eventId,
  });
  if (error) fail('Reading the entry requirement', error);
  return Array.isArray(data) ? data[0] : data;
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

/** Proof-of-attendance badges held by the signed-in user. */
export async function listMyBadges() {
  const { data, error } = await client()
    .from('badges')
    .select('id, event_id, asset_id, awarded_at, minted_at, events(title, starts_at, cover_image)')
    .order('awarded_at', { ascending: false });
  if (error) fail('Loading your badges', error);
  return data ?? [];
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

export async function removeFriend(requestId: string) {
  const { error } = await client()
    .from('friend_requests')
    .delete()
    .eq('id', requestId);
  if (error) fail('Removing the friend', error);
}

export async function fetchProfile(id: string): Promise<ProfileRow | null> {
  const { data } = await client()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  return data;
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
 * Works signed-out - the form lives in the marketing footer. The function is
 * idempotent and silent about whether the address was already there, so a
 * caller cannot use it to test who is subscribed; the UI therefore shows the
 * same confirmation either way, which is also the truthful answer to "am I on
 * the list?".
 */
export async function subscribeToNewsletter(
  email: string,
  source = 'website',
): Promise<void> {
  const { error } = await client().rpc('subscribe_newsletter', {
    p_email: email,
    p_source: source,
  });
  if (error) fail('Subscribing', error);
}

/* -------------------------------------------------------------------------- */
/*  Wallet ownership                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Step one of linking a wallet: get the text to sign.
 *
 * The server returns a full sentence, not a bare nonce, and the wallet shows
 * it to the user verbatim. A popup asking someone to approve an opaque UUID
 * teaches the habit every signature-phishing attack depends on.
 */
export async function issueWalletLinkChallenge(
  walletAddress: string,
): Promise<string> {
  const { data, error } = await client().rpc('issue_wallet_link_nonce', {
    p_wallet_address: walletAddress,
  });
  if (error) fail('Starting wallet verification', error);
  return data as string;
}

/**
 * Step two: submit the signature for verification.
 *
 * Postgres has no Ed25519, so the check happens in the `link-wallet` Edge
 * Function, which then calls a function revoked from `authenticated` - the
 * caller cannot link a wallet without going through the signature check.
 */
export async function linkWalletWithSignature(args: {
  walletAddress: string;
  message: string;
  /** Base58 or base64; the function accepts whichever the wallet produced. */
  signature: string;
}): Promise<ProfileRow> {
  const { data, error } = await client().functions.invoke('link-wallet', {
    body: args,
  });

  if (error) {
    /*
     * `FunctionsHttpError` carries the useful message in the response body
     * rather than in `error.message`, which is always "Edge Function returned a
     * non-2xx status code". Surfacing that instead of "already linked to
     * another account" would make a self-explanatory failure unreadable.
     */
    const detail = await readFunctionError(error);
    throw new Error(detail ?? 'Could not verify that wallet.');
  }

  const payload = data as { profile?: ProfileRow } | null;
  if (!payload?.profile) throw new Error('Could not verify that wallet.');
  return payload.profile;
}

/** Detach the wallet from this account, leaving the account intact. */
export async function unlinkWallet(): Promise<ProfileRow> {
  const { data, error } = await client().rpc('unlink_wallet');
  if (error) fail('Unlinking your wallet', error);
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

/** The `error` field of that body, for the callers that only need the message. */
async function readFunctionError(error: unknown): Promise<string | null> {
  const body = await readFunctionBody(error);
  return typeof body?.error === 'string' ? body.error : null;
}
