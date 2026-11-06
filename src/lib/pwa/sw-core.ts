// Service worker behavior with its browser APIs injected, so it is unit-tested with fakes.
// scripts/build-pwa.mjs inlines this module (and ./cache-rules) into public/sw.js; it may
// import only from ./cache-rules.
import {
  CACHE_PREFIX,
  CACHED_AT_HEADER,
  CLEAR_USER_CACHES_MESSAGE,
  NETWORK_TIMEOUT_MS,
  OFFLINE_OPT_IN_HEADER,
  PAGES_CACHE,
  PAGES_MAX_ENTRIES,
  PRECACHE_URLS,
  STATIC_CACHE,
  STATIC_MAX_ENTRIES,
  WARM_MESSAGE,
  classifyRequest,
  isCacheableResponse,
  isExpired,
  isNeverCachedPath,
  offlineFallbackPath,
  shouldWipeOnNavigation,
  type RequestKind,
  type ResponseFacts,
} from "./cache-rules";

export type WorkerDeps = {
  caches: CacheStorage;
  fetch: typeof fetch;
  /** The worker's origin (self.location.origin). */
  origin: string;
  /** navigator.language, for the offline page when the URL has no locale. */
  language?: string;
  now?: () => number;
  timeoutMs?: number;
};

export type WaitUntil = (promise: Promise<unknown>) => void;

export type Worker = {
  install(): Promise<void>;
  activate(): Promise<void>;
  /** The response to use, or null to let the browser handle the request untouched. */
  handleFetch(request: Request, waitUntil: WaitUntil): Promise<Response> | null;
  handleMessage(data: unknown): Promise<void>;
};

function factsOf(res: Response): ResponseFacts {
  return {
    status: res.status,
    type: res.type,
    redirected: res.redirected,
    contentType: res.headers.get("content-type"),
    cacheControl: res.headers.get("cache-control"),
    // Browsers hide Set-Cookie from scripts; checked anyway so a leak can never be stored.
    hasSetCookie: res.headers.has("set-cookie"),
    offlineOptIn: res.headers.get(OFFLINE_OPT_IN_HEADER),
  };
}

function swallow(promise: Promise<unknown>): Promise<void> {
  return promise.then(
    () => undefined,
    () => undefined,
  );
}

export function createWorker(deps: WorkerDeps): Worker {
  const now = deps.now ?? (() => Date.now());
  const timeoutMs = deps.timeoutMs ?? NETWORK_TIMEOUT_MS;
  const { caches } = deps;
  const abs = (path: string) => new URL(path, deps.origin).href;

  async function trim(name: string, max: number): Promise<void> {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
  }

  async function storeStatic(url: string, res: Response): Promise<void> {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(url, res);
    await trim(STATIC_CACHE, STATIC_MAX_ENTRIES);
  }

  async function storePage(url: string, res: Response): Promise<void> {
    const headers = new Headers(res.headers);
    headers.set(CACHED_AT_HEADER, String(now()));
    const stamped = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
    const cache = await caches.open(PAGES_CACHE);
    await cache.delete(url); // re-insert so the newest entry is last (oldest are trimmed first)
    await cache.put(url, stamped);
    await trim(PAGES_CACHE, PAGES_MAX_ENTRIES);
  }

  async function clearPages(): Promise<void> {
    await caches.delete(PAGES_CACHE);
  }

  /** A stored page that has not expired; expired ones are deleted. */
  async function freshPage(url: string): Promise<Response | undefined> {
    if (!(await caches.has(PAGES_CACHE))) return undefined;
    const cache = await caches.open(PAGES_CACHE);
    const res = await cache.match(url);
    if (!res) return undefined;
    const stamp = res.headers.get(CACHED_AT_HEADER);
    if (isExpired(stamp === null ? null : Number(stamp), now())) {
      await cache.delete(url);
      return undefined;
    }
    return res;
  }

  async function offlinePage(pathname: string): Promise<Response> {
    const cache = await caches.open(STATIC_CACHE);
    const page = await cache.match(abs(offlineFallbackPath(pathname, deps.language)));
    return page ?? Response.error();
  }

  function pageKey(url: string): string {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  }

  /** Stores or wipes after a page answered from the network. */
  function afterNavigation(url: string, res: Response, waitUntil: WaitUntil): void {
    const pathname = new URL(url).pathname;
    if (shouldWipeOnNavigation(pathname, res)) waitUntil(clearPages());
    else if (isCacheableResponse("navigation", factsOf(res))) waitUntil(storePage(pageKey(url), res.clone()));
  }

  async function networkFirst(request: Request, waitUntil: WaitUntil): Promise<Response> {
    const key = pageKey(request.url);
    const pathname = new URL(request.url).pathname;
    const network = deps.fetch(request).then((res) => {
      afterNavigation(request.url, res, waitUntil);
      return res;
    });
    network.catch(() => undefined); // handled below; avoid unhandled rejections after a timeout
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    try {
      const first = await Promise.race([network, timeout]);
      if (first !== "timeout") return first;
      const cached = await freshPage(key);
      if (cached) return cached;
      return await network;
    } catch {
      return (await freshPage(key)) ?? offlinePage(pathname);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Login, auth and onboarding: network only, never stored; wipes stored pages. */
  async function networkOnlyPage(request: Request, waitUntil: WaitUntil): Promise<Response> {
    waitUntil(clearPages());
    try {
      return await deps.fetch(request);
    } catch {
      return offlinePage(new URL(request.url).pathname);
    }
  }

  async function cacheFirst(request: Request, waitUntil: WaitUntil): Promise<Response> {
    const cache = await caches.open(STATIC_CACHE);
    const hit = await cache.match(request.url);
    if (hit) return hit;
    const res = await deps.fetch(request);
    if (isCacheableResponse("static", factsOf(res))) waitUntil(storeStatic(request.url, res.clone()));
    return res;
  }

  async function warm(url: string): Promise<void> {
    const kind: RequestKind = classifyRequest({ method: "GET", url, origin: deps.origin, mode: "no-cors" });
    const asPage = classifyRequest({ method: "GET", url, origin: deps.origin, mode: "navigate" });
    if (kind === "static") {
      const cache = await caches.open(STATIC_CACHE);
      if (await cache.match(url)) return;
      const res = await deps.fetch(url);
      if (isCacheableResponse("static", factsOf(res))) await storeStatic(url, res);
    } else if (asPage === "navigation") {
      const res = await deps.fetch(url, { credentials: "same-origin", redirect: "manual" });
      const pending: Promise<unknown>[] = [];
      afterNavigation(url, res, (p) => void pending.push(p));
      await Promise.all(pending);
    }
  }

  return {
    async install() {
      const cache = await caches.open(STATIC_CACHE);
      for (const url of PRECACHE_URLS) {
        const res = await deps.fetch(abs(url), { cache: "reload" });
        if (!res.ok) throw new Error(`Precache failed: ${url} (${res.status})`);
        await cache.put(abs(url), res);
      }
    },

    async activate() {
      const keep = [STATIC_CACHE, PAGES_CACHE];
      for (const name of await caches.keys()) {
        if (name.indexOf(CACHE_PREFIX) === 0 && keep.indexOf(name) < 0) await caches.delete(name);
      }
    },

    handleFetch(request, waitUntil) {
      const kind = classifyRequest({
        method: request.method,
        url: request.url,
        origin: deps.origin,
        mode: request.mode,
        accept: request.headers.get("accept"),
      });
      if (kind === "static") return cacheFirst(request, waitUntil);
      if (kind === "navigation") return networkFirst(request, waitUntil);
      const url = new URL(request.url);
      const isOwnPageLoad = request.method === "GET" && request.mode === "navigate" && url.origin === deps.origin;
      if (isOwnPageLoad && isNeverCachedPath(url.pathname)) return networkOnlyPage(request, waitUntil);
      return null;
    },

    async handleMessage(data) {
      if (!data || typeof data !== "object") return;
      const message = data as { type?: unknown; urls?: unknown };
      if (message.type === CLEAR_USER_CACHES_MESSAGE) {
        await clearPages();
      } else if (message.type === WARM_MESSAGE && Array.isArray(message.urls)) {
        const urls = message.urls.filter((x): x is string => typeof x === "string").slice(0, 200);
        for (const url of urls) await swallow(warm(url));
      }
    },
  };
}
