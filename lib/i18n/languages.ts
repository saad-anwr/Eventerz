/**
 * The languages someone can pick.
 *
 * # Why this is a list of codes and not a list of translations
 *
 * Nothing here ships a translation. Copy stays in English in the source, and
 * `translate()` fetches the target language at runtime and caches it. So adding
 * a language is adding a row to this list, not writing a locale file - which is
 * what makes "search for any language in the world" a reasonable thing to offer
 * rather than a promise of 130 hand-maintained files.
 *
 * The trade is quality: these are machine translations. `nativeName` is what the
 * picker shows, because someone looking for their own language is looking for
 * the word they call it, not the English exonym.
 *
 * Hindi is deliberately absent - removed on request.
 *
 * Shared verbatim with the mobile app (`src/i18n/languages.ts`). If one gains a
 * language the other must too, or the same account sees a different list
 * depending on which client it opened.
 */

export interface Language {
  /** ISO 639-1 where one exists; the translation API keys off this. */
  code: string;
  /** English name, so the search box matches "German" as well as "Deutsch". */
  name: string;
  nativeName: string;
  /** Right-to-left scripts need layout treatment beyond swapping strings. */
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'nb', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'zt', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'tl', name: 'Filipino', nativeName: 'Filipino' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto' },
];

/** The source language. Copy in the codebase is written in this. */
export const SOURCE_LANGUAGE = 'en';

export const languageFor = (code: string): Language | undefined =>
  LANGUAGES.find((l) => l.code === code);

/**
 * Every language name, in both spellings, as a set.
 *
 * These must never be machine-translated. A picker exists so someone who cannot
 * read the current interface can find their own language in it - and the moment
 * "Deutsch" is rendered as "Alemán" it has stopped doing that. Observed on
 * device: switching to Spanish turned English/Deutsch/Dansk/Norsk into
 * Inglés/Alemán/Danés/Noruego, leaving a German speaker with nothing to
 * recognise.
 *
 * Held here rather than as a flag on the picker because the rule belongs to the
 * names themselves: a language's name is a proper noun and reads the same
 * wherever it appears.
 */
export const LANGUAGE_NAMES: ReadonlySet<string> = new Set(
  LANGUAGES.flatMap((l) => [l.name, l.nativeName]),
);

/**
 * Filter for the picker's search box.
 *
 * Matches the native name and the English name, so both "Deutsch" and "German"
 * find German - someone may know their language by either depending on which
 * they were reading a second ago.
 */
export function searchLanguages(query: string): Language[] {
  const q = query.trim().toLowerCase();
  if (!q) return LANGUAGES;
  return LANGUAGES.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.nativeName.toLowerCase().includes(q) ||
      l.code.toLowerCase() === q,
  );
}
