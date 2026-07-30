/**
 * Translate a Supabase event row into the app's `EventItem` shape.
 *
 * Same approach as `map-profile.ts`: the presentational components already
 * speak `EventItem`, so mapping at the boundary means real data flows into the
 * existing UI without touching every card and list.
 */

import type { EventItem, EventCategory } from '@/lib/store/types';
import type { EventWithMeta } from './data';

export function eventRowToItem(row: EventWithMeta): EventItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    hostId: row.host_id,
    coverGradient: row.cover_gradient,
    coverImage: row.cover_image ?? undefined,
    category: row.category as EventCategory,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    location: row.location,
    isOnline: row.is_online,
    capacity: row.capacity,
    price: row.price,
    visibility: row.visibility === 'private' ? 'private' : 'public',
    requiresApproval: row.requires_approval,
    tokenGated: row.token_gated,
    attendeeIds: row.attendee_ids,
    tags: row.tags ?? [],
    createdAt: Date.parse(row.created_at) || Date.now(),
  };
}
