// Guards the Capacitor shell config and the static offline page (native/www).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../../capacitor.config";

const root = process.cwd();
const APP_URL = "https://lifeathlete.vercel.app/?source=pwa";

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function hexVars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

describe("capacitor.config", () => {
  it("has the permanent app identity and the remote server", () => {
    expect(config.appId).toBe("app.lifeathlete.android");
    expect(config.appName).toBe("Lifeathlete");
    expect(config.webDir).toBe("native/www");
    expect(config.server).toEqual({
      url: APP_URL,
      allowNavigation: ["lifeathlete.vercel.app"],
      cleartext: false,
      errorPath: "offline.html",
    });
  });

  it("only allows the app host, over https, with no wildcard", () => {
    expect(config.server?.url?.startsWith("https://")).toBe(true);
    const hosts = config.server?.allowNavigation ?? [];
    expect(hosts).toEqual(["lifeathlete.vercel.app"]);
    for (const h of hosts) expect(h).not.toContain("*");
  });

  it("ships the placeholder and offline pages in webDir", () => {
    expect(existsSync(join(root, config.webDir ?? "", "index.html"))).toBe(true);
    expect(existsSync(join(root, config.webDir ?? "", config.server?.errorPath ?? "missing"))).toBe(true);
  });
});

describe("native/www/offline.html", () => {
  const html = read("native/www/offline.html");

  it("has a retry control to the app URL, in Portuguese and English", () => {
    expect(html).toMatch(/<(button|a)\b[^>]*>/);
    expect(html).toContain(`href="${APP_URL}"`);
    expect(html).toContain("Estás sem ligação");
    expect(html).toContain("You are offline");
    expect(html).toContain("Tentar novamente");
    expect(html).toContain("Try again");
  });

  it("is self-contained: no http except the app URL and the SVG namespace", () => {
    const urls = (html.match(/https?:\/\/[^\s"')<]+/g) ?? []).filter((u) => u !== "http://www.w3.org/2000/svg");
    expect(urls.every((u) => u === APP_URL)).toBe(true);
    expect(html).not.toMatch(/<link\b|<script[^>]*\bsrc=|url\(/i);
  });

  it("mirrors the design tokens (dark default, light via media query)", () => {
    const tokens = read("src/styles/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const q = "@media (prefers-color-scheme: light)";
    const tSplit = tokens.indexOf(q);
    const tDark = hexVars(tokens.slice(0, tSplit));
    const tLight = hexVars(tokens.slice(tSplit));
    const page = html.replace(/\/\*[\s\S]*?\*\//g, "");
    const pSplit = page.indexOf(q);
    expect(pSplit).toBeGreaterThan(0);
    const pDark = hexVars(page.slice(0, pSplit));
    const pLight = hexVars(page.slice(pSplit));
    for (const name of ["bg-top", "bg-bottom", "bg-glow-a", "bg-glow-b", "hero-top", "hero-bottom", "color-primary", "color-on-primary", "color-primary-hover", "color-text", "color-text-muted", "color-focus"]) {
      expect(pDark[name], `dark ${name}`).toBe(tDark[name]);
      expect(pLight[name], `light ${name}`).toBe(tLight[name]);
    }
    for (const [k, v] of Object.entries(pDark)) expect(tDark[k], `dark ${k}`).toBe(v);
    for (const [k, v] of Object.entries(pLight)) expect(tLight[k], `light ${k}`).toBe(v);
  });
});

describe("capacitor package versions", () => {
  it("pins core, cli and android to exactly 8.6.0 (lockstep, no ranges)", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    const versions = ["@capacitor/core", "@capacitor/cli", "@capacitor/android"].map((n) => all[n]);
    expect(versions).toEqual(["8.6.0", "8.6.0", "8.6.0"]);
  });
});
