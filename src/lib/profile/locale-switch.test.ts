import { describe, expect, it, vi } from "vitest";
import { runLocaleSwitch } from "./locale-switch";

describe("runLocaleSwitch", () => {
  it("saves the locale first, then switches the URL locale", async () => {
    const order: string[] = [];
    const result = await runLocaleSwitch("en", "pt", {
      save: async () => void order.push("save"),
      navigate: () => void order.push("navigate"),
    });
    expect(result).toBe("done");
    expect(order).toEqual(["save", "navigate"]);
  });

  it("does not switch the URL when saving failed (the stored locale would bounce it back)", async () => {
    const navigate = vi.fn();
    const result = await runLocaleSwitch("en", "pt", { save: () => Promise.reject(new Error("x")), navigate });
    expect(result).toBe("error");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("choosing the current locale does nothing", async () => {
    const save = vi.fn(async () => {});
    const navigate = vi.fn();
    expect(await runLocaleSwitch("pt", "pt", { save, navigate })).toBe("unchanged");
    expect(save).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
