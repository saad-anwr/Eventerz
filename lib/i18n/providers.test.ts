import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These pin the two behaviours that decide whether a bad response reaches the
 * page. Everything else in this module is plumbing; these are the parts that
 * could put nonsense in front of a user.
 */

const respond = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);

/*
 * Re-imported per test because "out of quota" is deliberately sticky for the
 * life of the process - so without this the quota test silently switches every
 * test after it off, and they pass by doing nothing.
 */
let requestTranslations: typeof import("./providers").requestTranslations;

beforeEach(async () => {
  vi.resetModules();
  ({ requestTranslations } = await import("./providers"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestTranslations (MyMemory path)", () => {
  it("returns a translation for each requested string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond({
          responseStatus: 200,
          responseData: { translatedText: "Crear evento" },
        }),
      ),
    );

    const out = await requestTranslations(["Create Event"], "es");
    expect(out.get("Create Event")).toBe("Crear evento");
  });

  it("discards the shouty error strings MyMemory returns with a 200", async () => {
    /*
     * The real failure mode this guards. Asking for an unsupported language
     * gets HTTP 200 with a body of
     * "'ZT' IS AN INVALID TARGET LANGUAGE . EXAMPLE: LANGPAIR=EN|IT" - which,
     * taken at face value, would be rendered as the button's label.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond({
          responseStatus: 200,
          responseData: {
            translatedText:
              "'ZT' IS AN INVALID TARGET LANGUAGE . EXAMPLE: LANGPAIR=EN|IT",
          },
        }),
      ),
    );

    const out = await requestTranslations(["Tickets"], "zt");
    expect(out.size).toBe(0);
  });

  it("stops the whole run once the daily quota is spent", async () => {
    /*
     * Continuing would fail identically for every remaining string and is how
     * an IP gets blocked rather than merely throttled.
     */
    const fetchMock = vi.fn(() =>
      respond({ quotaFinished: true, responseData: { translatedText: "" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const many = Array.from({ length: 40 }, (_, i) => `String ${i}`);
    const out = await requestTranslations(many, "es");

    expect(out.size).toBe(0);
    // Each worker sees the quota flag once and stops; none loops on to a
    // second string, so the count is the worker pool rather than the batch.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("stops on the HTTP 429 MyMemory sends when the day runs out", async () => {
    /*
     * Captured from the live endpoint after a day of testing. Two things about
     * it broke the original handling:
     *
     *   - the refusal is an HTTP 429, so a `!response.ok` guard skipped it and
     *     every worker moved straight on to the next string;
     *   - `quotaFinished` is null rather than true, so the documented flag
     *     never fired either.
     *
     * Between them the app fired a full batch at an endpoint that had already
     * refused the first request, and told the user nothing.
     */
    const fetchMock = vi.fn(() =>
      respond(
        {
          responseStatus: 429,
          quotaFinished: null,
          responseDetails:
            "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  16 HOURS 20 MINUTES",
          responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL" },
        },
        429,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { requestTranslations: request, quotaExhausted } = await import(
      "./providers"
    );

    const many = Array.from({ length: 40 }, (_, i) => `String ${i}`);
    const out = await request(many, "es");

    expect(out.size).toBe(0);
    expect(quotaExhausted()).toBe(true);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("reports each translation as it lands, not only at the end", async () => {
    /*
     * What makes the language switch look like it worked. One string per
     * request means a page resolves over several seconds, and holding them all
     * back until the batch finished left the interface in English long enough
     * to read as a dead setting.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond({
          responseStatus: 200,
          responseData: { translatedText: "Entradas" },
        }),
      ),
    );

    const seen: string[] = [];
    await requestTranslations(["Tickets", "Wallet"], "es", (source) =>
      seen.push(source),
    );

    expect(seen.sort()).toEqual(["Tickets", "Wallet"]);
  });

  it("survives a network failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );

    await expect(requestTranslations(["Tickets"], "es")).resolves.toEqual(
      new Map(),
    );
  });

  it("does nothing for an empty batch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const out = await requestTranslations([], "es");
    expect(out.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
