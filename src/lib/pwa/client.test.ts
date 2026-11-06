import { describe, expect, it } from "vitest";
import { CLEAR_USER_CACHES_MESSAGE, PAGES_CACHE, WARM_MESSAGE } from "./cache-rules";
import { clearUserCaches, registerServiceWorker } from "./client";

function fakeCaches(fail = false) {
  const deleted: string[] = [];
  return {
    deleted,
    caches: {
      delete: async (name: string) => {
        if (fail) throw new Error("SecurityError");
        deleted.push(name);
        return true;
      },
    },
  };
}

function fakeServiceWorker(withController = true): {
  posted: unknown[];
  registered: [string, RegistrationOptions | undefined][];
  serviceWorker: {
    controller: { postMessage(m: unknown): void } | null;
    ready: Promise<{ active: { postMessage(m: unknown): void } }>;
    register(url: string, options?: RegistrationOptions): Promise<unknown>;
  };
} {
  const posted: unknown[] = [];
  const registered: [string, RegistrationOptions | undefined][] = [];
  const worker = { postMessage: (m: unknown) => posted.push(m) };
  return {
    posted,
    registered,
    serviceWorker: {
      controller: withController ? worker : null,
      ready: Promise.resolve({ active: worker }),
      register: async (url: string, options?: RegistrationOptions) => {
        registered.push([url, options]);
        return {};
      },
    },
  };
}

describe("clearUserCaches", () => {
  it("deletes the page cache and tells the worker to clear user caches", async () => {
    const c = fakeCaches();
    const sw = fakeServiceWorker();
    await clearUserCaches({ caches: c.caches, serviceWorker: sw.serviceWorker });
    expect(c.deleted).toEqual([PAGES_CACHE]);
    expect(sw.posted).toEqual([{ type: CLEAR_USER_CACHES_MESSAGE }]);
  });

  it("works without a controlling worker or without the Cache API", async () => {
    const c = fakeCaches();
    await clearUserCaches({ caches: c.caches, serviceWorker: fakeServiceWorker(false).serviceWorker });
    expect(c.deleted).toEqual([PAGES_CACHE]);
    const sw = fakeServiceWorker();
    await clearUserCaches({ caches: undefined, serviceWorker: sw.serviceWorker });
    expect(sw.posted).toHaveLength(1);
    await expect(clearUserCaches({})).resolves.toBeUndefined();
  });

  it("never throws, even when the Cache API fails", async () => {
    const sw = fakeServiceWorker();
    await expect(clearUserCaches({ caches: fakeCaches(true).caches, serviceWorker: sw.serviceWorker })).resolves.toBeUndefined();
    expect(sw.posted).toHaveLength(1);
  });
});

describe("registerServiceWorker", () => {
  const performance = {
    getEntriesByType: () => [{ name: "http://localhost:3000/_next/static/chunks/a.js" }, { name: "https://xyz.supabase.co/rest/v1/x" }],
  };

  it("does nothing outside production builds", async () => {
    const sw = fakeServiceWorker();
    expect(await registerServiceWorker({ production: false, serviceWorker: sw.serviceWorker, href: "http://localhost:3000/pt/login", performance })).toBe(false);
    expect(sw.registered).toEqual([]);
  });

  it("does nothing when service workers are unsupported", async () => {
    expect(await registerServiceWorker({ production: true, serviceWorker: undefined, href: "http://localhost:3000/pt/login", performance })).toBe(false);
  });

  it("first install (no controller at load): registers /sw.js without HTTP caching of the script, then warms", async () => {
    const sw = fakeServiceWorker(false);
    expect(await registerServiceWorker({ production: true, serviceWorker: sw.serviceWorker, href: "http://localhost:3000/pt/today", performance })).toBe(true);
    expect(sw.registered).toEqual([["/sw.js", { scope: "/", updateViaCache: "none" }]]);
    expect(sw.posted).toEqual([
      {
        type: WARM_MESSAGE,
        href: "http://localhost:3000/pt/today",
        urls: ["http://localhost:3000/_next/static/chunks/a.js", "https://xyz.supabase.co/rest/v1/x"],
      },
    ]);
  });

  it("does not warm when a worker already controls the page (every later load)", async () => {
    const sw = fakeServiceWorker(true);
    expect(await registerServiceWorker({ production: true, serviceWorker: sw.serviceWorker, href: "http://localhost:3000/pt/today", performance })).toBe(true);
    expect(sw.registered).toHaveLength(1); // still registers, so updates are checked
    expect(sw.posted).toEqual([]);
  });

  it("reports failure instead of throwing when registration fails", async () => {
    const sw = fakeServiceWorker();
    sw.serviceWorker.register = async () => {
      throw new Error("blocked");
    };
    expect(await registerServiceWorker({ production: true, serviceWorker: sw.serviceWorker, href: "http://localhost:3000/", performance })).toBe(false);
  });
});
