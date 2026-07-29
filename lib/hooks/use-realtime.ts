'use client';

/**
 * Realtime cache invalidation.
 *
 * Subscribes to Postgres changes and invalidates the matching React Query keys,
 * so a change made by *another* user appears here without a refresh. That is
 * what "real-time" means for this app: one person RSVPs, everyone watching that
 * event sees the count move.
 *
 * A table only streams if it is in the `supabase_realtime` publication —
 * migration 0003 adds all of them. Without that the channel connects happily
 * and then stays silent forever, which is a confusing way to fail.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/** Query keys, centralised so subscriptions and fetches cannot drift apart. */
export const queryKeys = {
  events: ['events'] as const,
  event: (id: string) => ['events', id] as const,
  eventsByHost: (id: string) => ['events', 'host', id] as const,
  eventsAttending: (id: string) => ['events', 'attending', id] as const,
  people: ['people'] as const,
  friendRequests: (id: string) => ['friends', 'requests', id] as const,
  friends: (id: string) => ['friends', id] as const,
  profile: (id: string) => ['profile', id] as const,
  messages: (channelId: string) => ['messages', channelId] as const,
  notifications: ['notifications'] as const,
};

/**
 * One subscription for the whole app, mounted in the app shell.
 *
 * Postgres change events carry the row, but reconciling every payload by hand
 * is where subtle cache bugs live. Invalidating the affected keys and letting
 * React Query refetch is simpler and, at this data volume, indistinguishable.
 */
export function useRealtimeSync(profileId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel('eventerz-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.events });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rsvps' },
        () => {
          // Attendee counts live on the event payload, so refresh both.
          queryClient.invalidateQueries({ queryKey: queryKeys.events });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.people });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['friends'] });
          queryClient.invalidateQueries({ queryKey: queryKeys.people });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, profileId]);
}

/**
 * Live subscription for a single chat channel.
 *
 * Separate from the global sync because chat is high-frequency and scoped —
 * subscribing to every message in the database to render one thread would be
 * wasteful and would leak other people's activity into this client.
 */
export function useRealtimeMessages(channelId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!channelId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.messages(channelId),
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, queryClient]);
}
