"use client";

/**
 * Runtime machine translation - the web half.
 *
 * Same contract as the mobile app's `src/i18n/translate.ts`: copy stays English
 * in the source, strings are translated on demand and cached, and nothing ever
 * blocks a render. The worst case is English for a moment rather than an empty
 * page.
 *
 * # Why requests are batched
 *
 * A page mounts a few hundred strings in one frame. That many HTTP requests to
 * a public endpoint is how you get rate-limited at exactly the moment someone is
 * watching, so they are collected for a tick and sent as one array.
 *
 * # Provider
 *
 * LibreTranslate's request shape - open, self-hostable, and no key required for
 * your own instance, so nothing here forces a billing relationship to run the
 * site. `NEXT_PUBLIC_TRANSLATE_URL` points it somewhere;
 * `NEXT_PUBLIC_TRANSLATE_API_KEY` is sent when set.
 *
 * With neither configured, translation is **off** and everything stays English.
 * Quietly shipping every visitor's interface copy to a third-party endpoint
 * nobody configured is not a reasonable default.
 */

const ENDPOINT = (process.env.NEXT_PUBLIC_TRANSLATE_URL ?? "").trim();
const API_KEY = (process.env.NEXT_PUBLIC_TRANSLATE_API_KEY ?? "").trim();

export const SOURCE_LANGUAGE = "en";

export const translationEnabled = (): boolean => /^https?:\/\//i.test(ENDPOINT);

const STORAGE_PREFIX = "eventerz.i18n.";

/** `language -> (english -> translated)`. */
const memory = new Map<string, Map<string, string>>();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const notify = () => listeners.forEach((l) => l());

function bucket(language: string): Map<string, string> {
  let found = memory.get(language);
  if (!found) {
    found = new Map();
    memory.set(language, found);
  }
  return found;
}

/**
 * Load a language's cache from localStorage.
 *
 * Worth persisting: the same strings are requested on every page load, and
 * re-fetching them is slow and - on a metered provider - billable for nothing.
 */
export function hydrateCache(language: string): void {
  if (language === SOURCE_LANGUAGE || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + language);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const target = bucket(language);
    for (const [k, v] of Object.entries(parsed)) target.set(k, v);
    notify();
  } catch {
    // A bad or unreadable cache is not worth failing a page load over.
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(language: string) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const target = memory.get(language);
    if (!target || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_PREFIX + language,
        JSON.stringify(Object.fromEntries(target)),
      );
    } catch {
      // Quota or private mode. The in-memory cache still works for this visit.
    }
  }, 1_000);
}

/* ------------------------------------------------------------------ queue -- */

let pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let activeLanguage = SOURCE_LANGUAGE;

const MAX_BATCH = 60;

async function flush() {
  flushTimer = null;
  const language = activeLanguage;
  const batch = Array.from(pending).slice(0, MAX_BATCH);
  pending = new Set(Array.from(pending).slice(MAX_BATCH));

  if (batch.length === 0 || language === SOURCE_LANGUAGE) return;

  try {
    const response = await fetch(`${ENDPOINT.replace(/\/$/, "")}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: batch,
        source: SOURCE_LANGUAGE,
        target: language,
        format: "text",
        ...(API_KEY ? { api_key: API_KEY } : {}),
      }),
    });
    if (!response.ok) throw new Error(`translate ${response.status}`);

    const body = (await response.json()) as {
      translatedText?: string | string[];
    };
    const out = Array.isArray(body.translatedText)
      ? body.translatedText
      : [body.translatedText ?? ""];

    const target = bucket(language);
    batch.forEach((source, i) => {
      const translated = out[i];
      if (typeof translated === "string" && translated.length > 0) {
        target.set(source, translated);
      }
    });

    schedulePersist(language);
    notify();
  } catch {
    /*
     * Silent and not retried, on purpose. The page already reads correctly in
     * English, so an error banner over working copy is noise - and retrying a
     * failing endpoint on every render is how a rate limit becomes permanent.
     * The strings stay uncached, so the next navigation tries again.
     */
  }

  if (pending.size > 0) flushTimer = setTimeout(flush, 50);
}

function enqueue(text: string) {
  pending.add(text);
  if (!flushTimer) flushTimer = setTimeout(flush, 50);
}

/* ----------------------------------------------------------------- public -- */

export function setActiveLanguage(language: string) {
  activeLanguage = language;
  hydrateCache(language);
}

export const getActiveLanguage = () => activeLanguage;

/**
 * The translation of `text`, or `text` itself while one is fetched.
 * Synchronous - it is called during render and from a DOM walk.
 */
export function translate(text: string, language: string): string {
  if (
    language === SOURCE_LANGUAGE ||
    !translationEnabled() ||
    !text ||
    // Numbers, wallet addresses, symbols: nothing a translator would change,
    // and sending them wastes quota while risking a mangled address.
    !/[a-zA-Z]{2}/.test(text)
  ) {
    return text;
  }

  const hit = bucket(language).get(text);
  if (hit) return hit;

  enqueue(text);
  return text;
}
