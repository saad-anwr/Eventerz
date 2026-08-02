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
 * Chosen in `providers.ts`. MyMemory by default - free, keyless, and therefore
 * working with no setup at all - and LibreTranslate whenever
 * `NEXT_PUBLIC_TRANSLATE_URL` names one, which is what a launch should use. The
 * quota trade-off between the two is documented there.
 */

import { requestTranslations } from "./providers";

export const SOURCE_LANGUAGE = "en";

/**
 * Always on. There is always a provider, so a picker can never silently do
 * nothing - which is the bug this feature exists to fix.
 */
export const translationEnabled = (): boolean => true;

export { quotaExhausted } from "./providers";

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

  /*
   * Failures are silent and not retried in place, on purpose. The page already
   * reads correctly in English, so an error banner over working copy is noise -
   * and retrying a failing provider on every render is how a rate limit becomes
   * permanent. Nothing is cached for a failed string, so the next navigation
   * asks again naturally.
   */
  const translated = await requestTranslations(batch, language);
  if (translated.size > 0) {
    const target = bucket(language);
    for (const [source, value] of translated) target.set(source, value);
    schedulePersist(language);
    notify();
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
