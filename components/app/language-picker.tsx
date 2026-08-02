"use client";

/**
 * Language picker.
 *
 * A search box rather than a row of chips: the catalogue is 46 languages and
 * growing, and a wall of buttons is not something anyone reads. Matches on the
 * native name *and* the English name, so both "Deutsch" and "German" find
 * German - people know their own language by either depending on which they
 * were just reading.
 */

import * as React from "react";
import { Check, Globe, Search } from "lucide-react";

import {
  useLanguage,
  useQuotaExhausted,
} from "@/components/layout/translation-provider";
import { languageFor, searchLanguages } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";

export function LanguagePicker() {
  const { language, setLanguage } = useLanguage();
  const outOfQuota = useQuotaExhausted();
  const [query, setQuery] = React.useState("");

  const active = languageFor(language);
  // Capped so the panel does not become a scrolling wall before anyone types.
  const results = React.useMemo(() => searchLanguages(query).slice(0, 30), [query]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <Globe className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Language</h3>
          <p className="truncate text-xs text-muted-foreground">
            {active ? `${active.nativeName} · ${active.name}` : "English"}
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search languages"
          aria-label="Search languages"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-3.5 text-sm text-white placeholder:text-muted-foreground focus:border-brand-purple/40 focus:outline-none"
        />
      </div>

      <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
        {results.map((entry) => {
          const selected = entry.code === language;
          return (
            <button
              key={entry.code}
              type="button"
              onClick={() => setLanguage(entry.code)}
              aria-pressed={selected}
              /* The names are already in their own language - translating the
                 picker itself would relabel every option. */
              data-no-translate
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                selected
                  ? "border-brand-purple/50 bg-brand-purple/15 text-white"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-white",
              )}
            >
              {selected && <Check className="size-3" />}
              {entry.nativeName}
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No language matches &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>

      {/*
        Said plainly. These are machine translations, and someone reading an
        awkward sentence deserves to know why rather than concluding the site is
        badly written in their language.
      */}
      {language !== "en" && (
        <p className="mt-3 text-xs text-muted-foreground">
          {outOfQuota
            ? "The free translation quota for today is used up, so text stays in English."
            : "Translated automatically. Wording may be imperfect."}
        </p>
      )}
    </div>
  );
}
