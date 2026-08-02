"use client";

/**
 * Where translations actually come from.
 *
 * Two providers, because they solve different problems:
 *
 *   **MyMemory** is the default and needs no configuration at all. It is free,
 *   keyless, and - verified against every script this app lists - returns real
 *   translations for Japanese, Arabic, Chinese, Hebrew, Swahili and the rest.
 *   That is what makes the language picker work out of the box rather than
 *   being a menu that does nothing until someone provisions a server.
 *
 * Kept identical to the mobile app's `src/i18n/providers.ts` apart from the env
 * prefix - the same account should not behave differently per client.
 *
 *   **LibreTranslate** is used instead the moment `NEXT_PUBLIC_TRANSLATE_URL`
 *   is set. It is the one to run in production: self-hostable, no per-request
 *   quota, and it takes a whole batch in a single POST.
 *
 * # The quota, stated plainly
 *
 * MyMemory's anonymous tier is roughly 5,000 characters per day per IP (about
 * 50,000 with an email address in `NEXT_PUBLIC_TRANSLATE_EMAIL`). That is
 * generous for one person exploring the app and nowhere near enough for a real
 * user base - the whole UI is a few thousand characters, so a handful of users
 * on a fresh cache would exhaust it. The disk cache means each string is paid
 * for once, but a launch still needs LibreTranslate behind
 * `NEXT_PUBLIC_TRANSLATE_URL`.
 *
 * When the quota runs out the app keeps working in English rather than showing
 * an error, and `quotaExhausted()` reports it so the UI can say why.
 */

const LIBRE_URL = (process.env.NEXT_PUBLIC_TRANSLATE_URL ?? '').trim();
const LIBRE_KEY = (process.env.NEXT_PUBLIC_TRANSLATE_API_KEY ?? '').trim();
const CONTACT_EMAIL = (process.env.NEXT_PUBLIC_TRANSLATE_EMAIL ?? '').trim();

export const usingLibreTranslate = (): boolean =>
  /^https?:\/\//i.test(LIBRE_URL);

/**
 * MyMemory speaks RFC3066, which differs from the ISO 639-1 codes the picker
 * uses in exactly two places. `zt` is rejected outright rather than ignored, so
 * without this Traditional Chinese would silently never translate.
 */
const MYMEMORY_CODES: Record<string, string> = {
  zh: 'zh-CN',
  zt: 'zh-TW',
};

const toProviderCode = (code: string): string =>
  MYMEMORY_CODES[code] ?? code;

let quotaOut = false;

/** True once the provider has said it is out of quota for the day. */
export const quotaExhausted = (): boolean => quotaOut;

/**
 * How many requests MyMemory gets at once.
 *
 * It takes one string per GET, and a screen can ask for sixty. Firing all of
 * them together is the reliable way to be rate-limited at the exact moment
 * someone is watching, so they go a few at a time.
 */
const MYMEMORY_CONCURRENCY = 4;

/**
 * MyMemory reports some failures as an HTTP 200 whose `translatedText` is a
 * shouted complaint:
 *
 *   'ZT' IS AN INVALID TARGET LANGUAGE . EXAMPLE: LANGPAIR=EN|IT
 *
 * Taken at face value that becomes the button's label. Detected by case rather
 * than by matching the sentence: the messages vary, but they are always
 * upper-case, and no real translation of a UI string is. Scripts without case -
 * Japanese, Arabic, Chinese - contain no Latin letters at all, so they are
 * never caught by this.
 *
 * Fails safe: a genuine all-caps translation would be dropped and the English
 * kept, which is the harmless direction.
 */
function looksLikeProviderError(text: string): boolean {
  return /[A-Z]/.test(text) && !/[a-z]/.test(text);
}

async function viaMyMemory(
  texts: string[],
  language: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const target = toProviderCode(language);
  const queue = [...texts];

  const worker = async () => {
    for (;;) {
      const text = queue.shift();
      if (text === undefined || quotaOut) return;

      const url =
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
        `&langpair=${encodeURIComponent(`en|${target}`)}` +
        (CONTACT_EMAIL ? `&de=${encodeURIComponent(CONTACT_EMAIL)}` : '');

      try {
        const response = await fetch(url);
        if (!response.ok) continue;

        const body = (await response.json()) as {
          responseStatus?: number | string;
          quotaFinished?: boolean;
          responseData?: { translatedText?: string };
        };

        if (body.quotaFinished) {
          // Stop the whole run: every further request would fail the same way,
          // and hammering a spent quota is how an IP gets blocked outright.
          quotaOut = true;
          return;
        }

        const translated = body.responseData?.translatedText;
        if (
          typeof translated === 'string' &&
          translated.length > 0 &&
          Number(body.responseStatus) === 200 &&
          !looksLikeProviderError(translated)
        ) {
          out.set(text, translated);
        }
      } catch {
        // Network blip. The string stays English and is retried on a later
        // navigation, since nothing was cached for it.
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MYMEMORY_CONCURRENCY, texts.length) }, worker),
  );

  return out;
}

async function viaLibreTranslate(
  texts: string[],
  language: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  const response = await fetch(`${LIBRE_URL.replace(/\/$/, '')}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: texts,
      source: 'en',
      target: language,
      format: 'text',
      ...(LIBRE_KEY ? { api_key: LIBRE_KEY } : {}),
    }),
  });
  if (!response.ok) throw new Error(`translate ${response.status}`);

  const body = (await response.json()) as {
    translatedText?: string | string[];
  };
  // An array `q` returns an array; a single string returns a string.
  const list = Array.isArray(body.translatedText)
    ? body.translatedText
    : [body.translatedText ?? ''];

  texts.forEach((source, i) => {
    const translated = list[i];
    if (typeof translated === 'string' && translated.length > 0) {
      out.set(source, translated);
    }
  });

  return out;
}

/** Translate a batch. Never throws - a failure just yields fewer entries. */
export async function requestTranslations(
  texts: string[],
  language: string,
): Promise<Map<string, string>> {
  if (texts.length === 0 || quotaOut) return new Map();
  try {
    return usingLibreTranslate()
      ? await viaLibreTranslate(texts, language)
      : await viaMyMemory(texts, language);
  } catch {
    return new Map();
  }
}
