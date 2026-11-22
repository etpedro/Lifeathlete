// Guard test, not a behavior test: effects do not run under renderToStaticMarkup (no DOM env).
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const register = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/health/capacitor", () => ({ registerNativeHealthBridge: register }));

import { NativeHealthRegister } from "./NativeHealthRegister";

describe("NativeHealthRegister", () => {
  it("renders nothing and registers only from an effect (not while rendering)", () => {
    expect(renderToStaticMarkup(<NativeHealthRegister />)).toBe("");
    expect(register).not.toHaveBeenCalled();
    const src = readFileSync(new URL("./NativeHealthRegister.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/useEffect\(\s*\(\)\s*=>\s*\{[^}]*registerNativeHealthBridge\(\)/);
  });
});
