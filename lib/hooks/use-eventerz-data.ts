'use client';

/**
 * Data hooks for the app section.
 *
 * Every screen reads through these rather than touching Supabase directly, so
 * caching, invalidation and the realtime wiring stay in one place.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approveGuest,
  cancelEvent,
  cancelRsvp,
  createEvent,
  declineGuest,
  dmChannelId,
  fetchDiscoverablePeople,
  fetchEvent,
  fetchEventGuests,
  fetchEvents,
  fetchEventsAttending,
  fetchEventsByHost,
  fetchFriendRequests,
  fetchFriends,
  fetchGuestPreview,
  fetchConversations,
  fetchMessages,
  fetchNotifications,
  fetchPayments,
  fetchProfile,
  fetchProfiles,
  issueWalletLinkChallenge,
  linkWalletWithSignature,
  markNotificationsRead,
  recordPayment,
  removeFriend,
  requestToJoin,
  respondToFriendRequest,
  sendFriendRequest,
  sendMessage,
  unlinkWallet,
  updateEvent,
  updateProfile,
  verifyPayment,
  type CreateEventInput,
  type RecordPaymentInput,
  type UpdateEventInput,
} from '@/lib/supabase/data';
import type { ProfileUpdate } from '@/lib/supabase/types';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { profileToUser } from '@/lib/supabase/map-profile';
import { useAppStore } from '@/lib/store/use-app-store';

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

/**
 * Everything that can change an event's guest state invalidates the same set,
 * so approving from the host panel updates the guest's own view of the event,
 * the counters on every card, and the "my events" list together.
 */
function useGuestStateInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.events });
    queryClient.invalidateQueries({ queryKey: queryKeys.guests });
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  };
}

/**
 * Ask to attend.
 *
 * Returns the resulting RSVP row so the caller can tell the three outcomes
 * apart - confirmed, pending approval, waitlisted. Errors are deliberately not
 * swallowed: the previous version of this had no error path at all, so a
 * server-side rejection made the button look broken rather than saying why.
 */
export function useRequestToJoin() {
  const invalidate = useGuestStateInvalidation();
  return useMutation({
    mutationFn: (eventId: string) => requestToJoin(eventId),
    onSuccess: invalidate,
  });
}

export function useCancelRsvp() {
  const invalidate = useGuestStateInvalidation();
  return useMutation({
    mutationFn: (eventId: string) => cancelRsvp(eventId),
    onSuccess: invalidate,
  });
}

export function useApproveGuest() {
  const invalidate = useGuestStateInvalidation();
  return useMutation({
    mutationFn: (vars: { eventId: string; profileId: string }) =>
      approveGuest(vars.eventId, vars.profileId),
    onSuccess: invalidate,
  });
}

export function useDeclineGuest() {
  const invalidate = useGuestStateInvalidation();
  return useMutation({
    mutationFn: (vars: { eventId: string; profileId: string }) =>
      declineGuest(vars.eventId, vars.profileId),
    onSuccess: invalidate,
  });
}

/** Full roster. Comes back empty unless the viewer is the host or confirmed. */
export function useEventGuests(eventId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.eventGuests(eventId ?? ''),
    queryFn: () => fetchEventGuests(eventId!),
    enabled: Boolean(eventId) && isSupabaseConfigured,
  });
}

/** A few faces for viewers who cannot read the roster. */
export function useGuestPreview(eventId: string | undefined, limit = 3) {
  return useQuery({
    queryKey: [...queryKeys.guestPreview(eventId ?? ''), limit],
    queryFn: () => fetchGuestPreview(eventId!, limit),
    enabled: Boolean(eventId) && isSupabaseConfigured,
    staleTime: 30_000,
  });
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                              */
/* -------------------------------------------------------------------------- */

export function useNotifications(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: fetchNotifications,
    enabled: Boolean(profileId) && isSupabaseConfigured,
  });
}

export function useMarkNotificationsRead(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!profileId) throw new Error('Sign in first.');
      return markNotificationsRead(profileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
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

/**
 * Save a host's edits.
 *
 * Invalidates notifications too: a move or a time change writes one to every
 * live guest, and the host is often looking at their own bell when it happens.
 */
export function useUpdateEvent(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateEventInput) => {
      if (!eventId) throw new Error('No event to update.');
      return updateEvent(eventId, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

export function useCancelEvent(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => {
      if (!eventId) throw new Error('No event to cancel.');
      return cancelEvent(eventId, reason);
    },
    onSuccess: () => {
      // Cancelling closes every RSVP and deletes unused tickets, so the guest
      // keys move as well as the event's own.
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
      queryClient.invalidateQueries({ queryKey: queryKeys.guests });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
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
    /**
     * Write the saved row back into the app store as well as invalidating the
     * queries.
     *
     * There are two sources of truth for "the current user" and they are not
     * the same one. React Query owns profiles fetched *by id*; the zustand
     * store owns the signed-in user, and `useSession` - which the sidebar, the
     * nav and every "you" avatar read from - only ever looks at the store.
     *
     * So invalidating query keys refreshed the half of the UI nobody was
     * looking at. Saving a new picture updated the profile header, because that
     * screen holds it in local state, and left the sidebar showing the old one
     * until a full page reload. The same was true of a changed name or handle.
     *
     * `updateProfile` already returns the saved row, so the fix is to stop
     * throwing it away.
     */
    onSuccess: (row) => {
      useAppStore.getState().syncRemoteUser(profileToUser(row));
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.people });
    },
  });
}

/** Batch lookup - one request fills an entire attendee list. */
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
    queryKey: queryKeys.conversations(profileId ?? ''),
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

/* -------------------------------------------------------------------------- */
/*  Payments                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The receipts a thread's messages point at.
 *
 * Keyed by channel and driven by the ids already in the message list, so it
 * costs one extra request per thread and none at all for a thread with no
 * payments in it.
 */
export function usePayments(channelId: string | null, paymentIds: string[]) {
  // Sorted so the key is stable regardless of message ordering.
  const key = [...paymentIds].sort().join(',');
  return useQuery({
    queryKey: [...queryKeys.payments(channelId ?? ''), key],
    queryFn: () => fetchPayments(paymentIds),
    enabled: paymentIds.length > 0 && isSupabaseConfigured,
    staleTime: 30_000,
  });
}

/**
 * File a receipt for a transfer that has already confirmed on-chain.
 *
 * Verification is fired off but not awaited. The receipt is useful the moment
 * it exists - it carries an explorer link - and making the user watch a
 * spinner while an RPC catches up with a transaction they already saw confirm
 * would be waiting for nothing. The tick appears over Realtime when the Edge
 * Function is done.
 */
export function useRecordPayment(channelId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordPaymentInput) => {
      const payment = await recordPayment(input);
      void verifyPayment(payment.signature);
      return payment;
    },
    onSuccess: () => {
      if (channelId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages(channelId),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  Wallet ownership                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Link a wallet by proving you hold its key.
 *
 * `signMessage` is supplied by the caller because the two platforms sign
 * differently - the browser wallet adapter's `signMessage` returns bytes, and
 * Mobile Wallet Adapter needs an association intent - and neither belongs in a
 * data hook.
 */
export function useLinkWallet(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      walletAddress: string;
      signMessage: (message: string) => Promise<string>;
    }) => {
      if (!profileId) throw new Error('Sign in before linking a wallet.');
      const message = await issueWalletLinkChallenge(args.walletAddress);
      const signature = await args.signMessage(message);
      return linkWalletWithSignature({
        walletAddress: args.walletAddress,
        message,
        signature,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.people });
    },
  });
}

export function useUnlinkWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unlinkWallet(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.people });
    },
  });
}

export { dmChannelId };
