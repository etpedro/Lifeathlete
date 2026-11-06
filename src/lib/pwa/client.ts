// Page-side service worker helpers. Browser APIs are injected so they are unit-tested.
import { CLEAR_USER_CACHES_MESSAGE, PAGES_CACHE, WARM_MESSAGE } from "./cache-rules";

type MessageTarget = { postMessage(message: unknown): void };

export type ClearDeps = {
  caches?: Pick<CacheStorage, "delete">;
  serviceWorker?: { controller: MessageTarget | null };
};

/**
 * Removes this user's stored pages (shared-device privacy): deletes the page cache from the
 * page side and also asks the controlling worker to do it. Never throws.
 */
export async function clearUserCaches(deps: ClearDeps = browserClearDeps()): Promise<void> {
  try {
    deps.serviceWorker?.controller?.postMessage({ type: CLEAR_USER_CACHES_MESSAGE });
  } catch {
    // the page-side delete below still runs
  }
  try {
    await deps.caches?.delete(PAGES_CACHE);
  } catch {
    // Cache API unavailable (e.g. blocked storage): nothing was stored either
  }
}

function browserClearDeps(): ClearDeps {
  return {
    caches: typeof caches === "undefined" ? undefined : caches,
    serviceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
  };
}

export type RegisterDeps = {
  production: boolean;
  serviceWorker?: {
    register(url: string, options?: RegistrationOptions): Promise<unknown>;
    ready: Promise<{ active: MessageTarget | null }>;
  };
  /** The current page URL. */
  href: string;
  performance?: { getEntriesByType(type: "resource"): { name: string }[] };
};

/**
 * Registers /sw.js in production builds only. After it is active, sends the URLs this page
 * already loaded so the worker can keep the ones its rules allow (static assets, Hoje).
 * Returns whether a worker was registered.
 */
export async function registerServiceWorker(deps: RegisterDeps): Promise<boolean> {
  if (!deps.production || !deps.serviceWorker) return false;
  try {
    await deps.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const registration = await deps.serviceWorker.ready;
    const loaded = deps.performance?.getEntriesByType("resource").map((entry) => entry.name) ?? [];
    registration.active?.postMessage({ type: WARM_MESSAGE, urls: [deps.href, ...loaded] });
    return true;
  } catch {
    return false;
  }
}
