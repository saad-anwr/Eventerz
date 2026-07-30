'use client';

/**
 * Data hooks for the app section.
 *
 * Every screen reads through these rather than touching Supabase directly, so
 * caching, invalidation and the realtime wiring stay in one place.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createEvent,
  dmChannelId,
  fetchDiscoverablePeople,
  fetchEvent,
  fetchEvents,
  fetchEventsAttending,
  fetchEventsByHost,
  fetchFriendRequests,
  fetchFriends,
  fetchConversations,
  fetchMessages,
  fetchProfile,
  fetchProfiles,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  sendMessage,
  toggleRsvp,
  updateProfile,
  type CreateEventInput,
} from '@/lib/supabase/data';
import type { ProfileUpdate } from '@/lib/supabase/types';
import { isSupabaseConfigured } from '@/lib/supabase/config';

import { queryKeys } from './use-realtime';

/* -------------------------------------------------------------------------- */
/*  Events                                                                     */
/* -------------------------------------------------------------------------- */

export function useEvents(options?: {
  upcomingOnly?: boolean;
  category?: string;
  query?: string;
}) {
  return useQuery({
    queryKey: [...queryKeys.events, options ?? {}],
    queryFn: () => fetchEvents(options),
    enabled: isSupabaseConfigured,
    staleTime: 15_000,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.event(id ?? ''),
    queryFn: () => fetchEvent(id!),
    enabled: Boolean(id) && isSupabaseConfigured,
  });
}

export function useEventsByHost(hostId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.eventsByHost(hostId ?? ''),
    queryFn: () => fetchEventsByHost(hostId!),
    enabled: Boolean(hostId) && isSupabaseConfigured,
  });
}

export function useEventsAttending(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.eventsAttending(profileId ?? ''),
    queryFn: () => fetchEventsAttending(profileId!),
    enabled: Boolean(profileId) && isSupabaseConfigured,
  });
}

export function useToggleRsvp(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => {
      if (!profileId) throw new Error('Sign in to RSVP.');
      return toggleRsvp(eventId, profileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    },
  });
}

export function useCreateEvent(hostId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) => {
      if (!hostId) throw new Error('Sign in to publish an event.');
      return createEvent(input, hostId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  People & friends                                                           */
/* -------------------------------------------------------------------------- */

export function useDiscoverablePeople() {
  return useQuery({
    queryKey: queryKeys.people,
    queryFn: fetchDiscoverablePeople,
    enabled: isSupabaseConfigured,
    staleTime: 15_000,
  });
}

export function useFriends(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.friends(profileId ?? ''),
    queryFn: () => fetchFriends(profileId!),
    enabled: Boolean(profileId) && isSupabaseConfigured,
  });
}

export function useFriendRequests(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.friendRequests(profileId ?? ''),
    queryFn: () => fetchFriendRequests(profileId!),
    enabled: Boolean(profileId) && isSupabaseConfigured,
  });
}

export function useSendFriendRequest(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addresseeId: string) => {
      if (!profileId) throw new Error('Sign in to add friends.');
      return sendFriendRequest(profileId, addresseeId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.people });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      respondToFriendRequest(id, accept),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.people });
    },
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => removeFriend(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.people });
    },
  });
}

export function useProfile(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile(id ?? ''),
    queryFn: () => fetchProfile(id!),
    enabled: Boolean(id) && isSupabaseConfigured,
    staleTime: 60_000,
  });
}

/**
 * Save profile edits.
 *
 * Writes to `profiles`, so the change is visible to every other user rather
 * than living in this browser only.
 */
export function useUpdateProfile(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfileUpdate) => {
      if (!profileId) throw new Error('Sign in to edit your profile.');
      return updateProfile(profileId, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.people });
    },
  });
}

/** Batch lookup — one request fills an entire attendee list. */
export function useProfiles(ids: string[]) {
  // Sorted so the key is stable regardless of roster ordering.
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['profiles', key],
    queryFn: () => fetchProfiles(ids),
    enabled: ids.length > 0 && isSupabaseConfigured,
    staleTime: 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                   */
/* -------------------------------------------------------------------------- */

export function useConversations(profileId: string | undefined) {
  return useQuery({
    queryKey: ['conversations', profileId ?? ''],
    queryFn: () => fetchConversations(profileId!),
    enabled: Boolean(profileId) && isSupabaseConfigured,
  });
}

export function useMessages(channelId: string | null) {
  return useQuery({
    queryKey: queryKeys.messages(channelId ?? ''),
    queryFn: () => fetchMessages(channelId!),
    enabled: Boolean(channelId) && isSupabaseConfigured,
  });
}

export function useSendMessage(
  channelId: string | null,
  senderId: string | undefined,
  scope: 'event' | 'dm' = 'dm',
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => {
      if (!channelId || !senderId) throw new Error('Sign in to send messages.');
      return sendMessage(channelId, senderId, body, scope);
    },
    onSuccess: () => {
      if (channelId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages(channelId),
        });
      }
    },
  });
}

export { dmChannelId };
