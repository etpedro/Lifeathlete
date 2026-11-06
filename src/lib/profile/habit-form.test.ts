import { describe, expect, it } from "vitest";
import { HabitError } from "@/lib/data/habits";
import { DataError } from "@/lib/data/errors";
import { habitErrorMessageKey, parseTargetInput, validateHabitForm } from "./habit-form";

describe("parseTargetInput", () => {
  it.each([
    ["5", 5],
    [" 2.5 ", 2.5],
    ["0,5", 0.5],
    ["", Number.NaN],
    ["abc", Number.NaN],
    ["1e3", 1000],
    ["Infinity", Number.NaN],
  ])("%j -> %s", (text, expected) => {
    expect(parseTargetInput(text)).toBe(expected);
  });
});

describe("validateHabitForm", () => {
  const base = { pillarId: "p1", title: "  Ler  ", kind: "value" as const, targetText: "20" };

  it("returns trimmed, parsed values", () => {
    expect(validateHabitForm(base)).toEqual({
      ok: true,
      value: { pillarId: "p1", title: "Ler", kind: "value", target: 20 },
    });
  });

  it("check habits ignore the target field (stored as 1)", () => {
    expect(validateHabitForm({ ...base, kind: "check", targetText: "" })).toMatchObject({
      ok: true,
      value: { kind: "check", target: 1 },
    });
  });

  it("reports every invalid field with a message key", () => {
    expect(validateHabitForm({ pillarId: "", title: "   ", kind: "value", targetText: "0" })).toEqual({
      ok: false,
      errors: { pillar: "errors.pillarRequired", title: "errors.invalidTitle", target: "errors.invalidTarget" },
    });
  });

  it("title length boundary: 80 ok, 81 not", () => {
    expect(validateHabitForm({ ...base, title: "a".repeat(80) }).ok).toBe(true);
    expect(validateHabitForm({ ...base, title: "a".repeat(81) })).toMatchObject({ ok: false, errors: { title: "errors.invalidTitle" } });
  });

  it("rejects a negative, NaN or empty value target but accepts 0.5", () => {
    for (const targetText of ["-1", "x", ""]) {
      expect(validateHabitForm({ ...base, targetText })).toMatchObject({ ok: false, errors: { target: "errors.invalidTarget" } });
    }
    expect(validateHabitForm({ ...base, targetText: "0.5" }).ok).toBe(true);
  });
});

describe("habitErrorMessageKey", () => {
  it("maps each habit error code to its own key", () => {
    expect(habitErrorMessageKey(new HabitError("invalid_title", "x"))).toBe("errors.invalidTitle");
    expect(habitErrorMessageKey(new HabitError("invalid_target", "x"))).toBe("errors.invalidTarget");
    expect(habitErrorMessageKey(new HabitError("invalid_kind", "x"))).toBe("errors.invalidKind");
    expect(habitErrorMessageKey(new HabitError("not_found", "x"))).toBe("errors.notFound");
    expect(habitErrorMessageKey(new HabitError("save_failed", "x"))).toBe("errors.save");
  });

  it("falls back to the generic save error for anything else", () => {
    expect(habitErrorMessageKey(new DataError("boom"))).toBe("errors.save");
    expect(habitErrorMessageKey("weird")).toBe("errors.save");
  });
});
