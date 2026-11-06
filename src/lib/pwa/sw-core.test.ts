import { describe, expect, it } from "vitest";
import {
  CACHED_AT_HEADER,
  OFFLINE_OPT_IN_HEADER,
  OFFLINE_OPT_IN_VALUE,
  PAGES_CACHE,
  PAGES_MAX_ENTRIES,
  PRECACHE_URLS,
  STATIC_CACHE,
} from "./cache-rules";
import { createWorker } from "./sw-core";

const ORIGIN = "http://localhost:3000";
const u = (path: string) => new URL(path, ORIGIN).href;

/** In-memory CacheStorage with the subset of the API the worker uses. */
class FakeCache {
  entries = new Map<string, Response>();
  private key(req: RequestInfo | URL) {
    return typeof req === "string" ? new URL(req, ORIGIN).href : req instanceof URL ? req.href : req.url;
  }
  async match(req: RequestInfo | URL) {
    const res = this.entries.get(this.key(req));
    return res ? res.clone() : undefined;
  }
  async put(req: RequestInfo | URL, res: Response) {
    this.entries.set(this.key(req), res);
  }
  async delete(req: RequestInfo | URL) {
    return this.entries.delete(this.key(req));
  }
  async keys() {
    return [...this.entries.keys()].map((k) => new Request(k));
  }
}
class FakeCaches {
  stores = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name)!;
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async has(name: string) {
    return this.stores.has(name);
  }
  urls(name: string) {
    return [...(this.stores.get(name)?.entries.keys() ?? [])].map((k) => new URL(k).pathname + new URL(k).search);
  }
}

/** A network response as the browser would deliver it (type "basic"). */
function net(body: string, init: ResponseInit & { type?: string; status?: number; redirected?: boolean } = {}) {
  const { type = "basic", status = 200, redirected = false, ...rest } = init;
  const res = new Response(status === 0 ? null : body, { ...rest, status: status === 0 ? 200 : status });
  Object.defineProperty(res, "type", { value: type });
  Object.defineProperty(res, "status", { value: status });
  Object.defineProperty(res, "redirected", { value: redirected });
  return res;
}
const html = (body: string, optIn = true, headers: Record<string, string> = {}) =>
  net(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
      ...(optIn ? { [OFFLINE_OPT_IN_HEADER]: OFFLINE_OPT_IN_VALUE } : {}),
      ...headers,
    },
  });
const js = (body: string) => net(body, { headers: { "content-type": "application/javascript" } });

type Route = (req: Request) => Response | Promise<Response>;

function setup(routes: Record<string, Route> = {}, opts: { timeoutMs?: number; language?: string } = {}) {
  const caches = new FakeCaches();
  const calls: string[] = [];
  let online = true;
  let clock = Date.UTC(2026, 10, 6, 9);
  const fetchFake = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const path = new URL(req.url).pathname + new URL(req.url).search;
    calls.push(path);
    if (!online) throw new TypeError("Failed to fetch");
    const route = routes[path] ?? routes[new URL(req.url).pathname];
    if (route) return route(req);
    if (PRECACHE_URLS.includes(path)) {
      return path.endsWith(".html") ? net(`offline ${path}`, { headers: { "content-type": "text/html" } }) : js(path);
    }
    return net("not found", { status: 404, headers: { "content-type": "text/html" } });
  };
  const pending: Promise<unknown>[] = [];
  const worker = createWorker({
    caches: caches as unknown as CacheStorage,
    fetch: fetchFake as typeof fetch,
    origin: ORIGIN,
    language: opts.language ?? "pt-PT",
    now: () => clock,
    timeoutMs: opts.timeoutMs ?? 50,
  });
  const waitUntil = (p: Promise<unknown>) => void pending.push(p);
  const settle = async () => {
    while (pending.length) await pending.shift();
  };
  async function go(path: string, init: RequestInit & { navigate?: boolean } = {}) {
    const { navigate = false, ...rest } = init;
    const req = new Request(new URL(path, ORIGIN), rest);
    if (navigate) Object.defineProperty(req, "mode", { value: "navigate" });
    const handled = worker.handleFetch(req, waitUntil);
    const res = handled ? await handled : null;
    await settle();
    return res;
  }
  return {
    caches,
    calls,
    worker,
    go,
    nav: (path: string) => go(path, { navigate: true }),
    settle,
    waitUntil,
    setOnline: (v: boolean) => (online = v),
    advance: (ms: number) => (clock += ms),
  };
}

describe("install / activate", () => {
  it("install precaches the offline pages, manifest and icons", async () => {
    const t = setup();
    await t.worker.install();
    expect(t.caches.urls(STATIC_CACHE).sort()).toEqual([...PRECACHE_URLS].sort());
  });

  it("install fails when a precache URL is not available", async () => {
    const t = setup({ "/offline/en.html": () => net("x", { status: 500 }) });
    await expect(t.worker.install()).rejects.toThrow();
  });

  it("activate removes old lifeathlete caches and leaves foreign caches alone", async () => {
    const t = setup();
    await t.caches.open("lifeathlete-pages-v0");
    await t.caches.open("lifeathlete-static-v0");
    await t.caches.open("someone-else");
    await t.caches.open(STATIC_CACHE);
    await t.worker.activate();
    expect((await t.caches.keys()).sort()).toEqual(["someone-else", STATIC_CACHE].sort());
  });
});

describe("requests the worker never handles", () => {
  it.each([
    ["POST", "/pt/today", { method: "POST", body: "x" }],
    ["cross-origin Supabase", "https://xyz.supabase.co/rest/v1/habit_logs", {}],
    ["RSC fetch", "/pt/today?_rsc=1", {}],
    ["the worker script", "/sw.js", {}],
  ] as const)("%s → passthrough (null)", async (_n, path, init) => {
    const t = setup();
    expect(t.worker.handleFetch(new Request(new URL(path, ORIGIN), init as RequestInit), t.waitUntil)).toBeNull();
  });
});

describe("static assets: cache-first", () => {
  it("first load goes to the network and is stored; the next is served from the cache", async () => {
    const t = setup({ "/_next/static/chunks/a.js": () => js("chunk-a") });
    expect(await (await t.go("/_next/static/chunks/a.js"))!.text()).toBe("chunk-a");
    t.setOnline(false);
    expect(await (await t.go("/_next/static/chunks/a.js"))!.text()).toBe("chunk-a");
    expect(t.calls.filter((c) => c === "/_next/static/chunks/a.js")).toHaveLength(1); // the 2nd load never reached the network
  });

  it("does not store failed static responses", async () => {
    const t = setup({ "/_next/static/chunks/b.js": () => net("boom", { status: 500 }) });
    await t.go("/_next/static/chunks/b.js");
    expect(t.caches.urls(STATIC_CACHE)).not.toContain("/_next/static/chunks/b.js");
  });
});

describe("navigations: NetworkFirst, Hoje only, privacy", () => {
  it("online: returns the network page and keeps Hoje (opted in) with a timestamp", async () => {
    const t = setup({ "/pt/today": () => html("hoje-A") });
    const res = await t.nav("/pt/today");
    expect(await res!.text()).toBe("hoje-A");
    const cached = await (await t.caches.open(PAGES_CACHE)).match(u("/pt/today"));
    expect(await cached!.text()).toBe("hoje-A");
    expect(Number(cached!.headers.get(CACHED_AT_HEADER))).toBeGreaterThan(0);
  });

  it("pages without the server opt-in are never stored", async () => {
    const t = setup({ "/pt/wheel": () => html("wheel", false) });
    await t.nav("/pt/wheel");
    expect(t.caches.urls(PAGES_CACHE)).toEqual([]);
  });

  it("Set-Cookie, 500 and redirected pages are never stored", async () => {
    const t = setup({
      "/pt/today": () => html("x", true, { "set-cookie": "sb=1" }),
      "/en/today": () => net("err", { status: 500, headers: { "content-type": "text/html", [OFFLINE_OPT_IN_HEADER]: OFFLINE_OPT_IN_VALUE } }),
    });
    await t.nav("/pt/today");
    await t.nav("/en/today");
    expect(t.caches.urls(PAGES_CACHE)).toEqual([]);
  });

  it("offline: serves the stored Hoje page", async () => {
    const t = setup({ "/pt/today": () => html("hoje-A") });
    await t.nav("/pt/today");
    t.setOnline(false);
    expect(await (await t.nav("/pt/today"))!.text()).toBe("hoje-A");
  });

  it("offline: an uncached page gets the localized offline page", async () => {
    const t = setup({}, { language: "en-US" });
    await t.worker.install();
    t.setOnline(false);
    expect(await (await t.nav("/pt/wheel"))!.text()).toBe("offline /offline/pt.html");
    expect(await (await t.nav("/en/achievements"))!.text()).toBe("offline /offline/en.html");
    expect(await (await t.nav("/"))!.text()).toBe("offline /offline/en.html"); // navigator.language
  });

  it("offline: login is never cached but still gets the offline page instead of a browser error", async () => {
    const t = setup({ "/pt/login": () => html("login", true) });
    await t.worker.install();
    await t.nav("/pt/login");
    expect(t.caches.urls(PAGES_CACHE)).toEqual([]);
    t.setOnline(false);
    expect(await (await t.nav("/pt/login"))!.text()).toBe("offline /offline/pt.html");
  });

  it("a stored page older than 24h is not served and is deleted", async () => {
    const t = setup({ "/pt/today": () => html("hoje-old") });
    await t.worker.install();
    await t.nav("/pt/today");
    t.advance(24 * 60 * 60 * 1000 + 1);
    t.setOnline(false);
    expect(await (await t.nav("/pt/today"))!.text()).toBe("offline /offline/pt.html");
    expect(t.caches.urls(PAGES_CACHE)).toEqual([]);
  });

  it("a slow network falls back to the stored page after the timeout", async () => {
    let slow = false;
    const t = setup({
      "/pt/today": () => (slow ? new Promise<Response>(() => {}) : html("hoje-A")),
    });
    await t.nav("/pt/today");
    slow = true;
    expect(await (await t.nav("/pt/today"))!.text()).toBe("hoje-A");
  });

  it("keeps at most 10 pages, dropping the oldest", async () => {
    const t = setup({ "/pt/today": () => html("d") });
    for (let i = 0; i < PAGES_MAX_ENTRIES + 3; i++) await t.nav(`/pt/today?date=2026-11-${String(i + 1).padStart(2, "0")}`);
    const urls = t.caches.urls(PAGES_CACHE);
    expect(urls).toHaveLength(PAGES_MAX_ENTRIES);
    expect(urls).not.toContain("/pt/today?date=2026-11-01");
    expect(urls).toContain("/pt/today?date=2026-11-13");
  });

  it("navigating to login/auth/onboarding wipes the stored pages (session may change)", async () => {
    for (const path of ["/pt/login", "/pt/auth/callback?code=1", "/en/onboarding"]) {
      const t = setup({ "/pt/today": () => html("hoje-A"), [path.split("?")[0]]: () => html("x", false) });
      await t.nav("/pt/today");
      await t.nav(path);
      expect(t.caches.urls(PAGES_CACHE), path).toEqual([]);
    }
  });

  it("a redirect from an app page (signed out) wipes the stored pages", async () => {
    let signedOut = false;
    const t = setup({
      "/pt/today": () => (signedOut ? net("", { type: "opaqueredirect", status: 0 }) : html("hoje-A")),
    });
    await t.nav("/pt/today");
    signedOut = true;
    const res = await t.nav("/pt/today");
    expect(res!.type).toBe("opaqueredirect"); // passed through for the browser to follow
    expect(t.caches.urls(PAGES_CACHE)).toEqual([]);
  });
});

describe("messages", () => {
  it("CLEAR_USER_CACHES deletes stored pages but keeps static assets", async () => {
    const t = setup({ "/pt/today": () => html("hoje-A") });
    await t.worker.install();
    await t.nav("/pt/today");
    await t.worker.handleMessage({ type: "CLEAR_USER_CACHES" });
    expect(await t.caches.has(PAGES_CACHE)).toBe(false);
    expect(t.caches.urls(STATIC_CACHE).length).toBeGreaterThan(0);
  });

  it("WARM stores already-loaded static assets and the opted-in current page, and ignores the rest", async () => {
    const t = setup({
      "/_next/static/chunks/w.js": () => js("w"),
      "/pt/today": () => html("hoje-W"),
      "/pt/wheel": () => html("wheel", false),
    });
    await t.worker.handleMessage({
      type: "WARM",
      urls: [u("/_next/static/chunks/w.js"), u("/pt/today"), u("/pt/wheel"), u("/pt/login"), "https://xyz.supabase.co/rest/v1/x", 42],
    });
    expect(t.caches.urls(STATIC_CACHE)).toEqual(["/_next/static/chunks/w.js"]);
    expect(t.caches.urls(PAGES_CACHE)).toEqual(["/pt/today"]);
    expect(t.calls).not.toContain("/pt/login");
    expect(t.calls).not.toContain("/rest/v1/x");
  });

  it("ignores unknown or malformed messages", async () => {
    const t = setup();
    await expect(t.worker.handleMessage(null)).resolves.toBeUndefined();
    await expect(t.worker.handleMessage({ type: "WARM", urls: "nope" })).resolves.toBeUndefined();
    await expect(t.worker.handleMessage("CLEAR_USER_CACHES")).resolves.toBeUndefined();
  });
});
