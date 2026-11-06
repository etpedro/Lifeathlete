// Guards the generated public/sw.js and offline pages against drift from their sources
// (src/lib/pwa/*.ts and the message files). Regenerate with `npm run build:pwa`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { buildPwa } from "../../../scripts/build-pwa.mjs";
import { CLEAR_USER_CACHES_MESSAGE, PAGES_CACHE } from "./cache-rules";

const ROOT = process.cwd();
const files = buildPwa() as Record<string, string>;

describe("generated PWA files", () => {
  it.each(Object.keys(files))("%s on disk matches its sources (run `npm run build:pwa`)", (path) => {
    expect(readFileSync(join(ROOT, path), "utf8")).toBe(files[path]);
  });

  it.each([
    ["pt", pt.offline],
    ["en", en.offline],
  ] as const)("the %s offline page is localized, static and has no user data or scripts", (locale, copy) => {
    const page = files[`public/offline/${locale}.html`];
    expect(page).toContain(`<html lang="${locale}">`);
    expect(page).toContain(`<title>${copy.title}</title>`);
    expect(page).toContain(copy.heading);
    expect(page).toContain(copy.body);
    expect(page).toContain(`href="/${locale}/today"`);
    expect(page).not.toMatch(/<script/i);
  });

  it("sw.js is a classic script that wires install, activate, fetch and message", async () => {
    const sw = files["public/sw.js"];
    expect(sw).not.toMatch(/^\s*(import|export)\s/m);
    expect(sw).toContain(PAGES_CACHE);
    expect(sw).toContain(CLEAR_USER_CACHES_MESSAGE);
    expect(sw).not.toContain("skipWaiting");

    const listeners: Record<string, (e: unknown) => void> = {};
    const deleted: string[] = [];
    const self = {
      location: { origin: "http://localhost:3000" },
      navigator: { language: "pt-PT" },
      caches: { delete: async (n: string) => (deleted.push(n), true) },
      fetch: async () => new Response(""),
      clients: { claim: async () => undefined },
      addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    };
    new Function("self", sw)(self);
    expect(Object.keys(listeners).sort()).toEqual(["activate", "fetch", "install", "message"]);

    const pending: Promise<unknown>[] = [];
    listeners.message({ data: { type: CLEAR_USER_CACHES_MESSAGE }, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
    expect(deleted).toEqual([PAGES_CACHE]);
  });
});
