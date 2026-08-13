import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readLocalNetworkAccess,
  requestLocalNetworkAccess,
  watchLocalNetworkAccess,
} from "./local-network-access";

/**
 * The regression this suite exists for.
 *
 * Mobile Wallet Adapter failed on Android Chrome with no error a user could
 * act on and, tellingly, no permission prompt at all - the site had no "Apps on
 * device" entry in Chrome's site settings, because it had never asked. The
 * cause was a permission *name*: the library queries `loopback-network`, the
 * origin-trial name, while Chrome ships `local-network-access`. The query threw,
 * the library read the throw as "no such permission here", and skipped the step
 * that asks.
 *
 * A one-word mistake, invisible in every log, so the naming is pinned here.
 */

/** A `PermissionStatus` that can change, like the real one. */
function fakeStatus(state: PermissionState) {
  const listeners = new Set<() => void>();
  return {
    status: {
      state,
      addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) =>
        void listeners.delete(fn),
    } as unknown as PermissionStatus,
    /** Flip the permission the way answering Chrome's prompt does. */
    set(next: PermissionState) {
      (this.status as { state: PermissionState }).state = next;
      listeners.forEach((fn) => fn());
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

/** A `navigator.permissions` that answers only to the names given. */
function stubPermissions(known: Record<string, PermissionStatus>) {
  const query = vi.fn(async ({ name }: { name: string }) => {
    const status = known[name];
    if (!status) {
      throw new TypeError(
        `Failed to execute 'query' on 'Permissions': Failed to read the 'name' ` +
          `property from 'PermissionDescriptor': The provided value '${name}' ` +
          `is not a valid enum value of type PermissionName.`
      );
    }
    return status;
  });
  vi.stubGlobal("navigator", { permissions: { query } });
  return query;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the name that broke Mobile Wallet Adapter", () => {
  it("asks for the permission Chrome actually ships", async () => {
    const query = stubPermissions({
      "local-network-access": fakeStatus("prompt").status,
    });

    expect(await readLocalNetworkAccess()).toBe("prompt");
    expect(query).toHaveBeenCalledWith({ name: "local-network-access" });
  });

  it("still answers to the origin-trial name", async () => {
    // Some builds only know the old name. Falling back costs one thrown query
    // and keeps those working.
    stubPermissions({ "loopback-network": fakeStatus("granted").status });

    expect(await readLocalNetworkAccess()).toBe("granted");
  });

  it("does not mistake an unknown name for a refusal", async () => {
    // This is the distinction the library loses. A browser with no such gate
    // must not be treated as one that said no - MWA has to be left to connect
    // exactly as it did before the permission existed.
    stubPermissions({});

    const state = await readLocalNetworkAccess();
    expect(state).toBe("unsupported");
    expect(state).not.toBe("denied");
  });

  it("reports unsupported rather than throwing without a Permissions API", async () => {
    vi.stubGlobal("navigator", {});
    expect(await readLocalNetworkAccess()).toBe("unsupported");
  });
});

describe("requestLocalNetworkAccess", () => {
  it("makes the request that triggers Chrome's prompt", async () => {
    const status = fakeStatus("prompt");
    stubPermissions({ "local-network-access": status.status });

    // A real probe is refused - nothing listens on port 80. The rejection is
    // the normal case, not a failure, and must not propagate.
    const fetchMock = vi.fn(async () => {
      status.set("granted");
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await requestLocalNetworkAccess()).toBe("granted");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost");
  });

  it("reports the refusal when the user declines", async () => {
    const status = fakeStatus("prompt");
    stubPermissions({ "local-network-access": status.status });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        status.set("denied");
        throw new TypeError("Failed to fetch");
      })
    );

    expect(await requestLocalNetworkAccess()).toBe("denied");
  });
});

describe("watchLocalNetworkAccess", () => {
  it("emits the current state and every change", async () => {
    const status = fakeStatus("prompt");
    stubPermissions({ "local-network-access": status.status });

    const seen: string[] = [];
    const stop = watchLocalNetworkAccess((s) => seen.push(s));
    await vi.waitFor(() => expect(seen).toEqual(["prompt"]));

    // Granting from Chrome's own site settings, with the tab still open.
    status.set("granted");
    expect(seen).toEqual(["prompt", "granted"]);

    stop();
    expect(status.listenerCount).toBe(0);
  });

  it("says unsupported when the browser has no such permission", async () => {
    stubPermissions({});

    const seen: string[] = [];
    watchLocalNetworkAccess((s) => seen.push(s));
    await vi.waitFor(() => expect(seen).toEqual(["unsupported"]));
  });
});
