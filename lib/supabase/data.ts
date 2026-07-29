'use client';

/**
 * Website data access.
 *
 * Mirrors the mobile app's `repositories/supabase/` so both clients hit the
 * same tables with the same semantics. Everything here is client-side: the app
 * section is interactive and realtime, so server components would only add a
 * round trip.
 */

import { getSupabaseBrowserClient } from './client';
import type {
  DiscoverablePersonRow,
  EventRow,
  FriendRequestRow,
  MessageRow,
  ProfileRow,
} from './types';

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
  attendee_ids: string[];
  host: ProfileRow | null;
};

/**
 * Attach rosters and hosts in two extra queries rather than one per event.
 * A naive `.select('*, host:profiles(*)')` join would also work, but PostgREST
 * embeds break when RLS hides the joined row, and hosts must always resolve.
 */
async function hydrateEvents(rows: EventRow[]): Promise<EventWithMeta[]> {
  if (rows.length === 0) return [];

  const eventIds = rows.map((r) => r.id);
  const hostIds = Array.from(new Set(rows.map((r) => r.host_id)));

  const [{ data: rsvps }, { data: hosts }] = await Promise.all([
    client()
      .from('rsvps')
      .select('event_id, profile_id')
      .in('event_id', eventIds)
      .neq('status', 'cancelled'),
    client().from('profiles').select('*').in('id', hostIds),
  ]);

  const roster: Record<string, string[]> = {};
  (rsvps ?? []).forEach((r) => {
    (roster[r.event_id] ??= []).push(r.profile_id);
  });

  const hostById = new Map((hosts ?? []).map((h) => [h.id, h]));

  return rows.map((row) => ({
    ...row,
    attendee_ids: roster[row.id] ?? [],
    host: hostById.get(row.host_id) ?? null,
  }));
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

export async function fetchEventsAttending(profileId: string) {
  const { data: rsvps } = await client()
    .from('rsvps')
    .select('event_id')
    .eq('profile_id', profileId)
    .neq('status', 'cancelled');

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
    })
    .select()
    .single();

  if (error) fail('Publishing the event', error);
  return data;
}

/** Toggle RSVP. Capacity and ticket allocation are enforced server-side. */
export async function toggleRsvp(eventId: string, profileId: string) {
  const supabase = client();

  const { data: existing } = await supabase
    .from('rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle();

  const going = existing && existing.status !== 'cancelled';

  const { error } = going
    ? await supabase.rpc('cancel_rsvp', { p_event_id: eventId })
    : await supabase.rpc('rsvp', { p_event_id: eventId });

  if (error) fail(going ? 'Cancelling your RSVP' : 'Reserving your ticket', error);
  return !going;
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

  const { data } = await client().from('profiles').select('*').in('id', ids);
  return data ?? [];
}

export async function sendFriendRequest(requesterId: string, addresseeId: string) {
  const { error } = await client()
    .from('friend_requests')
    .insert({ requester_id: requesterId, addressee_id: addresseeId });
  // A duplicate just means they already asked — not worth surfacing.
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
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function fetchProfiles(ids: string[]): Promise<ProfileRow[]> {
  if (ids.length === 0) return [];
  const { data } = await client().from('profiles').select('*').in('id', ids);
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                   */
/* -------------------------------------------------------------------------- */

/** Canonical DM key — sorted so both participants derive the same channel. */
export function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join('__')}`;
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
