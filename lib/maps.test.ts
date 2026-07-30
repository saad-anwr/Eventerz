import { afterEach, describe, expect, it } from 'vitest';

import {
  coordinatesOf,
  directionsUrl,
  isMappable,
  mapEmbedUrl,
  mapLinkUrl,
  staticMapUrl,
  type MappableLocation,
} from './maps';

/**
 * The point of these tests is the **degradation path**.
 *
 * A Maps key is optional, and most events in the database predate the location
 * columns entirely. So the interesting cases are not "does it build a Google URL"
 * — they are "what happens with no key", "what happens with no coordinates", and
 * "does a half-set coordinate pair ever produce a confident pin in the wrong
 * ocean".
 */
const KEY = 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY';

const originalKey = process.env[KEY];
afterEach(() => {
  if (originalKey === undefined) delete process.env[KEY];
  else process.env[KEY] = originalKey;
});

const withKey = () => {
  process.env[KEY] = 'test-key';
};
const withoutKey = () => {
  delete process.env[KEY];
};

const okhla: MappableLocation = {
  location: 'Ademzweb',
  address: 'B-272, Pocket B, Okhla Phase I, New Delhi, Delhi 110020',
  latitude: 28.5355,
  longitude: 77.2731,
  placeId: 'ChIJTest',
};

const unpinned: MappableLocation = { location: 'Someone’s rooftop, Delhi' };

describe('coordinatesOf', () => {
  it('returns the pair when both halves are finite', () => {
    expect(coordinatesOf(okhla)).toEqual({ lat: 28.5355, lng: 77.2731 });
  });

  it('refuses a half-set pair', () => {
    // One half alone maps to the equator or the prime meridian, which renders a
    // confident pin in the wrong ocean.
    expect(coordinatesOf({ location: 'x', latitude: 28.5 })).toBeNull();
    expect(coordinatesOf({ location: 'x', longitude: 77.2 })).toBeNull();
  });

  it('refuses NaN and Infinity', () => {
    expect(
      coordinatesOf({ location: 'x', latitude: Number.NaN, longitude: 77 }),
    ).toBeNull();
    expect(
      coordinatesOf({ location: 'x', latitude: 28, longitude: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });

  it('treats a genuine zero as a coordinate', () => {
    // 0,0 is in the Gulf of Guinea, but it is a real place — the guard is about
    // *missing* values, not falsy ones.
    expect(coordinatesOf({ location: 'x', latitude: 0, longitude: 0 })).toEqual({
      lat: 0,
      lng: 0,
    });
  });
});

describe('isMappable', () => {
  it('is false for an online event even with coordinates', () => {
    // A map of an online event is a map of nowhere.
    expect(isMappable({ ...okhla, isOnline: true })).toBe(false);
  });

  it('is true for an unpinned in-person event', () => {
    expect(isMappable(unpinned)).toBe(true);
  });
});

describe('mapEmbedUrl', () => {
  it('prefers the place id, which renders the venue card', () => {
    withKey();
    expect(mapEmbedUrl(okhla)).toContain('/embed/v1/place');
    // `place_id:` stays literal — that prefix is Embed API syntax, not part of
    // the id, so encoding the colon would make Google read the whole thing as a
    // search string and drop the venue card.
    expect(mapEmbedUrl(okhla)).toContain('q=place_id:ChIJTest');
  });

  it('falls back to coordinates when there is no place id', () => {
    withKey();
    const { placeId, ...noPlace } = okhla;
    expect(mapEmbedUrl(noPlace)).toContain('/embed/v1/view');
    expect(mapEmbedUrl(noPlace)).toContain('28.5355,77.2731');
  });

  it('falls back to search mode with only a text location', () => {
    withKey();
    expect(mapEmbedUrl(unpinned)).toContain('/embed/v1/search');
  });

  it('uses OpenStreetMap with no key but real coordinates', () => {
    withoutKey();
    const url = mapEmbedUrl(okhla);
    expect(url).toContain('openstreetmap.org');
    expect(url).toContain('marker=28.5355%2C77.2731');
    // A bounding box, not a centre-and-zoom — OSM's embed takes the former.
    expect(url).toContain('bbox=');
  });

  it('returns null with neither a key nor coordinates', () => {
    // A search string alone cannot be embedded without a geocoder; the caller
    // renders the address and the link-out instead.
    withoutKey();
    expect(mapEmbedUrl(unpinned)).toBeNull();
  });

  it('returns null for an online event regardless of key', () => {
    withKey();
    expect(mapEmbedUrl({ ...okhla, isOnline: true })).toBeNull();
  });
});

describe('mapLinkUrl', () => {
  it('needs no key', () => {
    withoutKey();
    expect(mapLinkUrl(okhla)).toContain('google.com/maps/search/');
    expect(mapLinkUrl(unpinned)).toContain('google.com/maps/search/');
  });

  it('pairs coordinates with the place id so Maps pins the exact door', () => {
    const url = mapLinkUrl(okhla);
    expect(url).toContain('query=28.5355%2C77.2731');
    expect(url).toContain('query_place_id=ChIJTest');
  });

  it('prefers the formatted address over the display string when unpinned', () => {
    const url = mapLinkUrl({ location: 'Ademzweb', address: '110020 Delhi' });
    expect(url).toContain(encodeURIComponent('110020 Delhi').replace(/%20/g, '+'));
  });
});

describe('directionsUrl', () => {
  it('uses the documented keyless scheme', () => {
    withoutKey();
    const url = directionsUrl(okhla);
    expect(url).toContain('google.com/maps/dir/');
    expect(url).toContain('destination=28.5355%2C77.2731');
    expect(url).toContain('destination_place_id=ChIJTest');
  });
});

describe('staticMapUrl', () => {
  it('needs both a key and coordinates', () => {
    withoutKey();
    expect(staticMapUrl(okhla)).toBeNull();
    withKey();
    expect(staticMapUrl(unpinned)).toBeNull();
    expect(staticMapUrl(okhla)).toContain('maps.googleapis.com/maps/api/staticmap');
  });

  it('marks the pin in brand purple', () => {
    withKey();
    expect(staticMapUrl(okhla)).toContain('0x9945FF');
  });
});
