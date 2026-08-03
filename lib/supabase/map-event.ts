/**
 * Translate a Supabase event row into the app's `EventItem` shape.
 *
 * Same approach as `map-profile.ts`: the presentational components already
 * speak `EventItem`, so mapping at the boundary means real data flows into the
 * existing UI without touching every card and list.
 */

import type { EventItem, EventCategory, RsvpState } from '@/lib/store/types';
import type { EventWithMeta } from './data';

/**
 * A banner URL a browser can actually load, or nothing.
 *
 * Events created by the app before the upload step existed stored the picker's
 * device-local path - `file:///data/user/0/.../ImagePicker/abc.jpeg` - straight
 * into `cover_image`. Rendering that in an `<img>` gives a broken-image icon,
 * which is worse than the gradient it replaced: the gradient is a design, and a
 * broken icon reads as a broken site.
 *
 * `file://` in a page also *means* something different from what was intended -
 * it addresses the visitor's own disk, not the host's - so there is no version
 * of this that could ever have worked off-device.
 *
 * The upload path is fixed and new events store a public URL; this guard is for
 * the rows already written, and for anything that ever writes a bad value
 * again. Only `http(s)` and protocol-relative URLs survive.
 */
export function displayableBanner(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^(https?:)?\/\//i.test(trimmed)) return undefined;
  return trimmed;
}

export function eventRowToItem(row: EventWithMeta): EventItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    hostId: row.host_id,
    coverGradient: row.cover_gradient,
    coverImage: displayableBanner(row.cover_image),
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

    // `?? 0` rather than a bare read: these columns arrive with 0005, and a
    // client running against a database that has not had it applied yet should
    // render "0 going" instead of "NaN going".
    confirmedCount: row.confirmed_count ?? 0,
    pendingCount: row.pending_count ?? 0,
    waitlistCount: row.waitlist_count ?? 0,
    checkedInCount: row.checked_in_count ?? 0,
    myStatus: (row.my_status as RsvpState | null) ?? undefined,
    waitlistPosition: row.waitlist_position ?? undefined,

    cancelledAt: row.cancelled_at ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,

    // `?? undefined` rather than `?? 0`: a missing coordinate has to stay
    // missing. Zero is the Gulf of Guinea, and a confident pin in the wrong
    // ocean is worse than no map at all.
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    placeId: row.place_id ?? undefined,
    address: row.address ?? undefined,
  };
}
