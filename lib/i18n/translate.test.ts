import { describe, expect, it, vi } from "vitest";

import { translate } from "./translate";

/**
 * `translate()` returns the English on a cache miss and fetches in the
 * background, so every assertion here is about what it refuses to send rather
 * than what comes back. That is the part with teeth: a string that should never
 * have been translated has already been rewritten by the time anyone notices.
 */
describe("translate", () => {
  it("leaves language names alone", () => {
    // The bug this exists for: switching to Spanish rendered the picker's own
    // chips as Inglés / Alemán / Danés, so a German speaker had nothing left to
    // recognise in the one screen meant to rescue them.
    for (const name of ["English", "Deutsch", "Dansk", "Norsk", "Español"]) {
      expect(translate(name, "es")).toBe(name);
    }
  });

  it("leaves the source language untouched", () => {
    expect(translate("Create Event", "en")).toBe("Create Event");
  });

  it("ignores strings with nothing to translate", () => {
    // A wallet address run through a translator comes back unusable.
    for (const text of ["0.5", "", "HUTXvjrFNbyCYeu9GxpK5aGYmuyAFC6HHECC781"]) {
      expect(translate(text, "es")).toBe(text);
    }
  });

  it("returns the English while a translation is in flight", () => {
    // Stubbed because a miss schedules a real fetch, and a test suite that
    // reaches the network is a test suite that fails on a train.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    expect(translate("Create Event", "es")).toBe("Create Event");
    vi.unstubAllGlobals();
  });
});
