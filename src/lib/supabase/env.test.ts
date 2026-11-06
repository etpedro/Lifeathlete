import { describe, expect, it } from "vitest";
import { readSupabaseEnv } from "./env";

describe("readSupabaseEnv", () => {
  it("returns url and anon key", () => {
    expect(readSupabaseEnv("https://x.supabase.co", "anon")).toEqual({ url: "https://x.supabase.co", anonKey: "anon" });
  });

  it.each([
    [undefined, "anon", /NEXT_PUBLIC_SUPABASE_URL/],
    ["", "anon", /NEXT_PUBLIC_SUPABASE_URL/],
    ["https://x.supabase.co", undefined, /NEXT_PUBLIC_SUPABASE_ANON_KEY/],
    ["https://x.supabase.co", "  ", /NEXT_PUBLIC_SUPABASE_ANON_KEY/],
  ])("throws a clear error when a variable is missing (%j, %j)", (url, key, pattern) => {
    expect(() => readSupabaseEnv(url, key)).toThrow(pattern);
  });
});
