/**
 * Turning what a host typed into a place on a map.
 *
 * Two providers behind one interface, chosen by whether
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set:
 *
 *   • **Google Places (New)** — better results, better data, costs money, needs
 *     a key. Both endpoints used here support CORS, so this runs in the browser
 *     with no proxy route to maintain.
 *   • **Nominatim (OpenStreetMap)** — free, keyless, no signup. Rate-limited to
 *     roughly one request a second by its usage policy, which is why the caller
 *     debounces rather than searching on every keystroke.
 *
 * The fallback is not a degraded mode nobody should use. A self-hosted
 * instance, a preview deploy or a fork gets working location search without
 * anyone having to open a Google Cloud console first, and the shape of the
 * result is identical either way — so the picker has no idea which one
 * answered.
 *
 * Geocoding is always optional. A host who types "Ayush's rooftop" and picks
 * nothing still publishes a valid event; `location` keeps their words and the
 * coordinates stay null. Requiring a resolvable address would make the picker
 * mandatory, which is the wrong trade for a product where half the events are
 * in someone's living room.
 */

export interface PlaceSuggestion {
  /** Stable id for the provider that produced it. Google place id, or an OSM key. */
  id: string;
  /** Short name — "Ademzweb". */
  name: string;
  /** Full line — "B-272, Pocket B, Okhla Phase I, New Delhi, Delhi 110020". */
  address: string;
  /** Present immediately from Nominatim; needs a details call for Google. */
  latitude?: number;
  longitude?: number;
  /** Only Google has one. Null keeps `events.place_id` honest. */
  placeId?: string;
}

export interface ResolvedPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

const key = () => process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

export const geocoderName = (): 'google' | 'openstreetmap' =>
  key() ? 'google' : 'openstreetmap';

/* -------------------------------------------------------------------------- */
/*  Search                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Suggestions for a partial query.
 *
 * Returns an empty array rather than throwing on any provider failure. A
 * geocoder being down must not stop someone publishing an event — they can
 * still type an address, which is what the field did before this existed.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  try {
    return key() ? await searchGoogle(q, signal) : await searchNominatim(q, signal);
  } catch (error) {
    // An aborted request is the normal outcome of typing another character,
    // not a failure worth logging.
    if ((error as Error)?.name !== 'AbortError') {
      console.warn('[geocode] search failed', error);
    }
    return [];
  }
}

async function searchGoogle(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key(),
    },
    body: JSON.stringify({ input: query }),
  });

  if (!response.ok) throw new Error(`Places autocomplete returned ${response.status}`);
  const payload = await response.json();

  return (payload.suggestions ?? [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .map((p: any) => ({
      id: p.placeId,
      placeId: p.placeId,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      address: p.structuredFormat?.secondaryText?.text ?? p.text?.text ?? '',
    }));
}

async function searchNominatim(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '1',
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    { signal, headers: { Accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

  const rows = await response.json();
  return (rows as any[]).map((row) => {
    // `display_name` is the whole comma-separated chain. The first segment is
    // usually the venue or house number, which is what belongs in the title.
    const parts = String(row.display_name ?? '').split(',');
    return {
      id: `osm:${row.osm_type}:${row.osm_id}`,
      name: row.name || parts[0]?.trim() || query,
      address: String(row.display_name ?? ''),
      latitude: Number.parseFloat(row.lat),
      longitude: Number.parseFloat(row.lon),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Resolve                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Turn a suggestion into coordinates.
 *
 * Nominatim already returned them, so this is a no-op there. Google's
 * autocomplete deliberately does not include coordinates — they are a separate,
 * separately-billed Place Details call, which is why this is a second step and
 * only happens for the one suggestion the host actually picked.
 */
export async function resolvePlace(
  suggestion: PlaceSuggestion,
): Promise<ResolvedPlace | null> {
  if (
    typeof suggestion.latitude === 'number' &&
    typeof suggestion.longitude === 'number'
  ) {
    return {
      name: suggestion.name,
      address: suggestion.address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      placeId: suggestion.placeId,
    };
  }

  if (!suggestion.placeId || !key()) return null;

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(suggestion.placeId)}`,
      {
        headers: {
          'X-Goog-Api-Key': key(),
          // Field mask is required by Places (New) and is what keeps this on
          // the cheapest billing tier — asking for photos or reviews here would
          // silently cost several times more per event created.
          'X-Goog-FieldMask': 'location,formattedAddress,displayName',
        },
      },
    );
    if (!response.ok) throw new Error(`Place details returned ${response.status}`);

    const place = await response.json();
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    return {
      name: place.displayName?.text ?? suggestion.name,
      address: place.formattedAddress ?? suggestion.address,
      latitude: lat,
      longitude: lng,
      placeId: suggestion.placeId,
    };
  } catch (error) {
    console.warn('[geocode] resolve failed', error);
    return null;
  }
}
