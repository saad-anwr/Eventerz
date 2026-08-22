"use client";

import * as React from "react";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";
import {
  geocoderName,
  resolvePlace,
  searchPlaces,
  type PlaceSuggestion,
} from "@/lib/geocode";
import { mapEmbedUrl } from "@/lib/maps";
import { inputCls } from "./form-controls";
import { cn } from "@/lib/utils";

/**
 * The structured half of a location. Undefined throughout means "the host
 * typed something a geocoder never saw", which is a supported outcome - see
 * `lib/geocode.ts` for why pinning is never mandatory.
 */
export interface PickedLocation {
  /** What the host wants displayed. Always their own words unless they pick. */
  location: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  address?: string;
}

interface LocationPickerProps {
  value: PickedLocation;
  onChange: (next: PickedLocation) => void;
  placeholder?: string;
}

/**
 * Location field with search-as-you-type and a map preview.
 *
 * The text input is the primary control and always writable. Search is
 * additive: picking a suggestion attaches coordinates to what is already
 * there, and editing the text afterwards drops them - because a pin that no
 * longer matches the words above it is worse than no pin, and silently keeping
 * the old coordinates is how an event ends up mapped to the venue the host
 * just decided against.
 */
export function LocationPicker({
  value,
  onChange,
  placeholder = "City, venue or address",
}: LocationPickerProps) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [resolving, setResolving] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const pinned = typeof value.latitude === "number";

  // Debounced search. 350 ms is comfortably inside Nominatim's ~1 req/s policy
  // at typing speed, and short enough that the list feels attached to the
  // keyboard rather than to a timer.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const found = await searchPlaces(q, controller.signal);
      if (!controller.signal.aborted) {
        setResults(found);
        setSearching(false);
        setOpen(true);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setSearching(false);
    };
  }, [query]);

  // Close the suggestion list on an outside click.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = async (suggestion: PlaceSuggestion) => {
    setResolving(suggestion.id);
    const resolved = await resolvePlace(suggestion);
    setResolving(null);
    setOpen(false);
    setQuery("");

    if (!resolved) {
      // Details lookup failed. Keep the name so the field is still useful -
      // the event just has no pin, which is the same as never searching.
      onChange({ ...value, location: suggestion.name || value.location });
      return;
    }

    onChange({
      location: resolved.name || value.location || resolved.address,
      address: resolved.address,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      placeId: resolved.placeId,
    });
  };

  const clearPin = () =>
    onChange({
      location: value.location,
      latitude: undefined,
      longitude: undefined,
      placeId: undefined,
      address: undefined,
    });

  const embed = pinned ? mapEmbedUrl(value) : null;

  return (
    <div ref={containerRef} className="space-y-3">
      {/* What gets displayed on the event page. */}
      <input
        className={inputCls}
        value={value.location}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value;
          // Editing the words invalidates the pin. See the component note.
          onChange(
            pinned
              ? {
                  location: next,
                  latitude: undefined,
                  longitude: undefined,
                  placeId: undefined,
                  address: undefined,
                }
              : { ...value, location: next },
          );
        }}
      />

      {/* Search, separate from the display string on purpose. */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {searching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
        </span>
        <input
          className={cn(inputCls, "pl-10")}
          value={query}
          placeholder="Search for a place to pin it on the map"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />

        {open && results.length > 0 && (
          <ul className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-white/10 bg-brand-bg-soft/95 p-1.5 shadow-card backdrop-blur-2xl">
            {results.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  onClick={() => void pick(suggestion)}
                  disabled={resolving !== null}
                  className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-60"
                >
                  {resolving === suggestion.id ? (
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand-purple" />
                  ) : (
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand-purple" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">
                      {suggestion.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {suggestion.address}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pinned ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          {embed && (
            <iframe
              title="Map preview"
              src={embed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-40 w-full border-0 grayscale-[0.35] contrast-[1.05]"
            />
          )}
          <div className="flex items-start gap-2.5 p-3">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-green" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-white">
                Pinned on the map
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {value.address}
              </span>
            </span>
            <button
              type="button"
              onClick={clearPin}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X className="size-3.5" />
              Remove pin
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Optional - a pinned location gets a map and directions on the event
          page. Searching uses{" "}
          {geocoderName() === "google" ? "Google Places" : "OpenStreetMap"}.
        </p>
      )}
    </div>
  );
}
