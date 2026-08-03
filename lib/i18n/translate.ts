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

import { LANGUAGE_NAMES } from "./languages";
import {
  quotaExhausted as isQuotaExhausted,
  requestTranslations,
} from "./providers";

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

let notifyTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Coalesced repaint.
 *
 * Strings land one at a time, and re-walking the DOM sixty times in a row would
 * cost more than the translation did. Batching them into one pass every quarter
 * second still reads as copy filling in.
 */
function scheduleNotify() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    notify();
  }, 250);
}

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
let quotaAnnounced = false;

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
  /*
   * Cached and repainted as each string arrives, not once at the end.
   *
   * The provider answers one string per request and a page asks for sixty,
   * which measured at half a minute. Holding all of them back until the last
   * one landed meant picking a language did nothing at all for that whole time
   * - indistinguishable from a broken setting, and the reason this looked
   * unfixed after it already worked.
   */
  const target = bucket(language);

  const translated = await requestTranslations(
    batch,
    language,
    (source, value) => {
      target.set(source, value);
      scheduleNotify();
    },
  );
  /*
   * Running out of quota is the one state change nothing else announces.
   *
   * Every other repaint is triggered by a translation arriving, and once the
   * allowance is gone none ever will - so the picker would sit on "translated
   * automatically" while translating nothing. Announced once; the flag never
   * goes back.
   */
  if (isQuotaExhausted() && !quotaAnnounced) {
    quotaAnnounced = true;
    notify();
  }

  if (translated.size > 0) schedulePersist(language);

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
    !/[a-zA-Z]{2}/.test(text) ||
    // A language's own name, which must survive into every other language.
    LANGUAGE_NAMES.has(text)
  ) {
    return text;
  }

  const hit = bucket(language).get(text);
  if (hit) return hit;

  enqueue(text);
  return text;
}
