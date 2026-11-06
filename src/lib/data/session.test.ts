import { describe, expect, it } from "vitest";
import { getAccessState } from "./session";
import { createFakeDb, type Row } from "./testing/fake-db";

const setup = (userId: string | null, profiles: Row[] = []) => createFakeDb({ userId, tables: { profiles } });

describe("getAccessState", () => {
  it("signed out", async () => {
    expect(await getAccessState(setup(null).db)).toEqual({ authenticated: false, onboarded: false });
  });

  it("signed in without a profile", async () => {
    expect(await getAccessState(setup("u").db)).toEqual({ authenticated: true, onboarded: false });
  });

  it("signed in, profile not onboarded", async () => {
    const db = setup("u", [{ user_id: "u", onboarded_at: null }]).db;
    expect(await getAccessState(db)).toEqual({ authenticated: true, onboarded: false });
  });

  it("signed in and onboarded (only the caller's profile counts)", async () => {
    const db = setup("u", [
      { user_id: "other", onboarded_at: null },
      { user_id: "u", onboarded_at: "2026-11-06T00:00:00Z" },
    ]).db;
    expect(await getAccessState(db)).toEqual({ authenticated: true, onboarded: true });
  });

  it("propagates a profile read error instead of guessing", async () => {
    const fake = setup("u");
    fake.failNext("profiles", "select");
    await expect(getAccessState(fake.db)).rejects.toThrow(/profile/);
  });
});
