"use client";

import * as React from "react";
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import {
  coordinatesOf,
  directionsUrl,
  hasGoogleMapsKey,
  mapEmbedUrl,
  mapLinkUrl,
  type MappableLocation,
} from "@/lib/maps";
import { cn } from "@/lib/utils";

interface EventMapProps {
  place: MappableLocation;
  className?: string;
}

/**
 * The venue, on a map.
 *
 * An `<iframe>` rather than the Maps JavaScript SDK: the SDK is ~300 KB and
 * takes over part of the page's DOM to draw what is, here, a static picture
 * with a pin in it. The embed is lazy, costs this bundle nothing, and renders
 * the venue's own Google card — name, rating, photo — when there is a place id.
 *
 * Three states, all of which have to look deliberate:
 *
 *   • **Pinned** — a real map, plus Open and Directions.
 *   • **Unpinned, with an address** — no map is possible without geocoding, so
 *     it shows the address and a search link. This is the common case for
 *     events created before the location fields existed, and it must not look
 *     like something failed to load.
 *   • **Online** — renders nothing. A map of an online event is a map of
 *     nowhere.
 */
export function EventMap({ place, className }: EventMapProps) {
  if (place.isOnline) return null;

  const embed = mapEmbedUrl(place);
  const coords = coordinatesOf(place);
  const label = place.location?.trim();
  if (!embed && !label) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl",
        className,
      )}
    >
      {embed ? (
        <iframe
          title={`Map of ${label || "the venue"}`}
          src={embed}
          loading="lazy"
          /*
           * Google's embed refuses to render without a referrer it can attribute
           * the request to, so `no-referrer` would produce a blank grey box.
           * `no-referrer-when-downgrade` sends one over HTTPS and withholds it
           * on a downgrade, which is the tightest policy that still works.
           */
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          className="h-56 w-full border-0"
        />
      ) : (
        <div className="flex h-28 items-center justify-center bg-white/[0.02]">
          <MapPin className="size-6 text-muted-foreground/50" />
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-purple/15 text-brand-purple">
          <MapPin className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{label}</p>
          {place.address && place.address !== label && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {place.address}
            </p>
          )}
          {!coords && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hasGoogleMapsKey()
                ? "Approximate — the host did not pin an exact spot."
                : "Open in Maps to search for this address."}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <a
            href={mapLinkUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/85 transition-colors hover:border-white/20 hover:text-white"
          >
            <ExternalLink className="size-3.5" />
            Open
          </a>
          <a
            href={directionsUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-brand-purple/30 bg-brand-purple/10 px-3 py-2 text-xs font-medium text-brand-purple transition-colors hover:bg-brand-purple/20"
          >
            <Navigation className="size-3.5" />
            Directions
          </a>
        </div>
      </div>
    </div>
  );
}
