"use client";

/**
 * Theme provider.
 *
 * Owns one thing: whether `<html>` carries the `light` class. `globals.css`
 * defines the dark tokens on `:root` and overrides them under `.light`, so this
 * is the whole mechanism - no per-component work, no `dark:` variants.
 *
 * The preference is persisted and shared with the mobile app's Settings screen
 * in spirit (`light | dark | system`), so the two behave the same way.
 */

import * as React from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "eventerz.theme";

interface ThemeValue {
  preference: ThemePreference;
  /** What is actually on screen, with `system` resolved. */
  resolved: "light" | "dark";
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeValue>({
  preference: "dark",
  resolved: "dark",
  setPreference: () => {},
});

export const useTheme = () => React.useContext(ThemeContext);

/**
 * Applied before React hydrates, inlined in <head>.
 *
 * Without this the page paints dark, hydrates, then snaps to light - a visible
 * flash on every navigation for anyone who chose light. Reading localStorage in
 * an effect is always too late; the only place early enough is a blocking
 * script before first paint.
 *
 * Wrapped in try/catch because Safari's private mode throws on localStorage,
 * and a theme is not worth a blank page.
 */
export const themeScript = `
(function(){try{
  var p = localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || 'dark';
  var m = window.matchMedia('(prefers-color-scheme: light)').matches;
  if (p === 'light' || (p === 'system' && m)) document.documentElement.classList.add('light');
}catch(e){}})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] =
    React.useState<ThemePreference>("dark");
  const [systemLight, setSystemLight] = React.useState(false);

  // Adopt whatever the pre-paint script already decided, so the two agree.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
      if (stored) setPreferenceState(stored);
    } catch {
      // Storage unavailable; the default stands.
    }
  }, []);

  // `system` has to keep tracking the OS after load - someone flipping their
  // machine to light at sunset expects the page to follow without a reload.
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    setSystemLight(query.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemLight(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" =
    preference === "system" ? (systemLight ? "light" : "dark") : preference;

  React.useEffect(() => {
    document.documentElement.classList.toggle("light", resolved === "light");
  }, [resolved]);

  const setPreference = React.useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not fatal - the choice just will not survive a reload.
    }
  }, []);

  const value = React.useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
