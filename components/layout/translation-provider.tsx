"use client";

/**
 * Applies the chosen language to whatever is on screen.
 *
 * # Why this walks the DOM instead of wrapping strings
 *
 * The mobile app has exactly one text primitive, so translating there is a
 * three-line change inside `<Text>`. This codebase has no such choke point -
 * copy lives in bare JSX, in `title`/`placeholder`/`aria-label` props, and in
 * component defaults, across roughly 270 places. Wrapping every one in a `t()`
 * call would be a mechanical edit of most files in the repo, and would have to
 * be repeated by hand on every new string forever.
 *
 * So this translates the rendered output instead, which is the same approach a
 * browser's own translate feature takes, and it needs no discipline from
 * anybody writing a component.
 *
 * # Why overwriting React's text nodes is safe here
 *
 * React only writes a text node when the value it rendered *changes*. Setting
 * `nodeValue` ourselves does not make React re-render, and a re-render with the
 * same English string is a no-op that leaves our translation in place. When the
 * string genuinely changes, React writes the new English and the observer below
 * picks it up. The original English is kept per-node so a language switch
 * re-translates from the source rather than translating a translation.
 *
 * # What is deliberately skipped
 *
 * Code, wallet addresses, signatures and user-generated content. Translating a
 * base58 address would corrupt it; translating someone's event description is
 * not this feature's job and would silently rewrite what a host wrote.
 */

import * as React from "react";

import { LANGUAGES } from "@/lib/i18n/languages";
import {
  SOURCE_LANGUAGE,
  hydrateCache,
  setActiveLanguage,
  subscribe,
  translate,
  translationEnabled,
} from "@/lib/i18n/translate";

const STORAGE_KEY = "eventerz.language";

interface LanguageValue {
  language: string;
  setLanguage: (next: string) => void;
}

const LanguageContext = React.createContext<LanguageValue>({
  language: SOURCE_LANGUAGE,
  setLanguage: () => {},
});

export const useLanguage = () => React.useContext(LanguageContext);

/** Elements whose text must never be touched. */
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "CODE",
  "PRE",
  "KBD",
  "SAMP",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "SVG",
]);

/**
 * Opt-out marker. Put `data-no-translate` on anything holding an address, a
 * signature, a handle, or copy a user wrote.
 */
const SKIP_ATTR = "data-no-translate";

function shouldSkip(node: Node): boolean {
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;

  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute?.(SKIP_ATTR)) return true;
    el = el.parentElement;
  }
  return false;
}

export function TranslationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [language, setLanguageState] = React.useState(SOURCE_LANGUAGE);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && LANGUAGES.some((l) => l.code === stored)) {
        setLanguageState(stored);
        setActiveLanguage(stored);
        hydrateCache(stored);
      }
    } catch {
      // Storage unavailable; English stands.
    }
  }, []);

  const setLanguage = React.useCallback((next: string) => {
    setLanguageState(next);
    setActiveLanguage(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not fatal - the choice just will not survive a reload.
    }
  }, []);

  React.useEffect(() => {
    if (language === SOURCE_LANGUAGE || !translationEnabled()) return;

    /*
     * The English a node started with. Keyed on the node so switching from
     * Spanish to Japanese translates the original rather than the Spanish -
     * machine-translating a machine translation compounds every error.
     */
    const original = new WeakMap<Text, string>();
    let applying = false;

    const applyTo = (node: Text) => {
      if (shouldSkip(node)) return;

      const source = original.get(node) ?? node.nodeValue ?? "";
      const trimmed = source.trim();
      if (trimmed.length < 2) return;

      if (!original.has(node)) original.set(node, source);

      const translated = translate(trimmed, language);
      if (translated === trimmed) return;

      // Preserve the node's own leading/trailing whitespace - it is often
      // what separates two inline elements.
      const [, lead = "", , trail = ""] =
        source.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? [];
      node.nodeValue = lead + translated + trail;
    };

    const walk = (root: Node) => {
      const iterator = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const found: Text[] = [];
      let current = iterator.nextNode();
      while (current) {
        found.push(current as Text);
        current = iterator.nextNode();
      }
      found.forEach(applyTo);
    };

    const run = () => {
      if (applying) return;
      applying = true;
      walk(document.body);
      // Cleared on a microtask so our own writes do not re-enter through the
      // observer below.
      queueMicrotask(() => {
        applying = false;
      });
    };

    run();

    // Re-run when React swaps content in, and when late translations arrive.
    const observer = new MutationObserver(() => {
      if (!applying) run();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const unsubscribe = subscribe(run);

    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [language]);

  const value = React.useMemo(
    () => ({ language, setLanguage }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
