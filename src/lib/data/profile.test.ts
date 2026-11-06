import { describe, expect, it } from "vitest";
import { ProfileError, setProfileLocale } from "./profile";
import { createFakeDb, type Row } from "./testing/fake-db";

const setup = (profiles: Row[] = [{ user_id: "u", locale: "pt" }, { user_id: "other", locale: "pt" }]) =>
  createFakeDb({ userId: "u", tables: { profiles } });

describe("setProfileLocale", () => {
  it("updates only the caller's profiles.locale", async () => {
    const f = setup();
    await setProfileLocale(f.db, "u", "en");
    expect(f.tables.profiles.map((p) => [p.user_id, p.locale])).toEqual([
      ["u", "en"],
      ["other", "pt"],
    ]);
  });

  it("rejects an unknown locale before writing", async () => {
    const f = setup();
    await expect(setProfileLocale(f.db, "u", "fr" as never)).rejects.toMatchObject({ code: "invalid_locale" });
    expect(f.writes).toEqual([]);
  });

  it("no profile row -> not_found; a backend failure -> save_failed without the raw message", async () => {
    await expect(setProfileLocale(setup([]).db, "u", "en")).rejects.toMatchObject({ code: "not_found" });
    const f = setup();
    f.failNext("profiles", "update", { code: "XX000", message: "secret backend detail" });
    const err = await setProfileLocale(f.db, "u", "en").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProfileError);
    expect((err as ProfileError).code).toBe("save_failed");
    expect((err as Error).message).not.toContain("secret");
  });
});
