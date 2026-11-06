import { describe, expect, it } from "vitest";
import { noticeRole } from "./notices";

describe("noticeRole", () => {
  it("informational notices are polite (status); failures that need action are alerts", () => {
    expect(noticeRole({ kind: "rolledOver" })).toBe("status");
    expect(noticeRole({ kind: "fallback" })).toBe("status");
    expect(noticeRole({ kind: "load" })).toBe("alert");
    expect(noticeRole({ kind: "save" })).toBe("alert");
    expect(noticeRole({ kind: "outsideWindow" })).toBe("alert");
    expect(noticeRole({ kind: "dropped", count: 2 })).toBe("alert");
  });
});
