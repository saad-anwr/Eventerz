/**
 * Map URLs for an event's location.
 *
 * Everything here is a pure string builder — no SDK, no `<script>` tag, no
 * runtime. The Google Maps JavaScript API is ~300 KB and takes over the page's
 * DOM to draw something that is, on an event page, a static picture with a pin
 * in it. The Embed API does the same job in an `<iframe>` that costs this
 * bundle nothing.
 *
 * # Degrading without a key
 *
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is optional, and the feature has to work
 * without it — a self-hosted instance, a preview deploy, or a fork should show
 * a map rather than an apology. So:
 *
 *   | Have | Embedded map | Link out |
 *   | --- | --- | --- |
 *   | Key + coordinates | Google Embed API | Google Maps |
 *   | Coordinates, no key | OpenStreetMap embed | Google Maps |
 *   | Key, no coordinates | Google Embed API, search mode | Google Maps search |
 *   | Neither | — (address text only) | Google Maps search |
 *
 * The link-out never needs a key: `maps.google.com/?api=1` is a documented
 * public URL scheme, and on a phone it opens the native Maps app.
 */

export interface MappableLocation {
  /** The host's own display string. Always present. */
  location: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  /** Formatted address from the geocoder, when there was one. */
  address?: string;
  isOnline?: boolean;
}

export const googleMapsApiKey = (): string =>
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

export const hasGoogleMapsKey = (): boolean => googleMapsApiKey().length > 0;

/** Coordinates, when the pair is complete and finite. */
export function coordinatesOf(
  place: MappableLocation,
): { lat: number; lng: number } | null {
  const { latitude, longitude } = place;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude };
}

/** True when there is anything worth drawing a map for. */
export function isMappable(place: MappableLocation): boolean {
  if (place.isOnline) return false;
  return Boolean(coordinatesOf(place) || place.location.trim());
}

/**
 * The `src` for an embedded map, or null when there is nothing to show.
 *
 * Prefers the place id over raw coordinates when a key is available: Google
 * renders the venue's own card — name, rating, photo — for a place id and a
 * bare pin for coordinates, and the card is what the host actually meant by
 * "B-272, Okhla Phase I".
 */
export function mapEmbedUrl(place: MappableLocation): string | null {
  if (place.isOnline) return null;

  const key = googleMapsApiKey();
  const coords = coordinatesOf(place);

  if (key) {
    if (place.placeId) {
      return `https://www.google.com/maps/embed/v1/place?key=${key}&q=place_id:${encodeURIComponent(place.placeId)}&zoom=15`;
    }
    if (coords) {
      return `https://www.google.com/maps/embed/v1/view?key=${key}&center=${coords.lat},${coords.lng}&zoom=15&maptype=roadmap`;
    }
    if (place.location.trim()) {
      return `https://www.google.com/maps/embed/v1/search?key=${key}&q=${encodeURIComponent(place.location)}&zoom=14`;
    }
    return null;
  }

  /*
   * No key: OpenStreetMap's embed needs a bounding box rather than a
   * centre-and-zoom, so derive a small one around the point. ±0.006° is
   * roughly 700 m of latitude — close enough to read street names, wide
   * enough that the pin is not the only thing visible.
   */
  if (coords) {
    const pad = 0.006;
    const bbox = [
      coords.lng - pad,
      coords.lat - pad,
      coords.lng + pad,
      coords.lat + pad,
    ].join('%2C');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coords.lat}%2C${coords.lng}`;
  }

  // A search string alone cannot be embedded without a geocoder. The caller
  // renders the address and the link-out below instead.
  return null;
}

/**
 * A link that opens the location in Maps — the browser on desktop, the native
 * app on a phone.
 *
 * Uses the `?api=1` URL scheme, which is documented, keyless and stable. The
 * older `maps.google.com/maps?q=` form still works but is not guaranteed to.
 */
export function mapLinkUrl(place: MappableLocation): string {
  const coords = coordinatesOf(place);
  const params = new URLSearchParams({ api: '1' });

  if (coords) {
    params.set('query', `${coords.lat},${coords.lng}`);
    // With both, Maps pins the exact place rather than the nearest match to
    // the coordinates — which for a building in a dense block is a different
    // door.
    if (place.placeId) params.set('query_place_id', place.placeId);
  } else {
    params.set('query', place.address || place.location);
  }

  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/** Turn-by-turn from wherever the user is. */
export function directionsUrl(place: MappableLocation): string {
  const coords = coordinatesOf(place);
  const params = new URLSearchParams({ api: '1' });
  params.set(
    'destination',
    coords ? `${coords.lat},${coords.lng}` : place.address || place.location,
  );
  if (place.placeId) params.set('destination_place_id', place.placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * A flat image of the map, for surfaces that cannot host an iframe.
 *
 * Static Maps is a billed request per render, so this is only used where an
 * embed is impossible — a native list row, an OG image — and never on a page
 * that already has a real embed on it.
 */
export function staticMapUrl(
  place: MappableLocation,
  options?: { width?: number; height?: number; zoom?: number; scale?: 1 | 2 },
): string | null {
  const key = googleMapsApiKey();
  const coords = coordinatesOf(place);
  if (!key || !coords) return null;

  const params = new URLSearchParams({
    key,
    center: `${coords.lat},${coords.lng}`,
    zoom: String(options?.zoom ?? 15),
    size: `${options?.width ?? 640}x${options?.height ?? 280}`,
    scale: String(options?.scale ?? 2),
    maptype: 'roadmap',
    markers: `color:0x9945FF|${coords.lat},${coords.lng}`,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
