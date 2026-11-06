import { describe, expect, it } from "vitest";
import { emptySelection, selectedTemplateIds, toggleHabit, togglePillar, type CatalogPillar } from "./selection";

const catalog: CatalogPillar[] = [
  { id: "p1", slug: "exercise", templates: [{ id: "a", title: { pt: "A", en: "A" } }, { id: "b", title: { pt: "B", en: "B" } }] },
  { id: "p2", slug: "reading", templates: [{ id: "c", title: { pt: "C", en: "C" } }] },
];

describe("onboarding selection", () => {
  it("starts empty", () => {
    expect(selectedTemplateIds(catalog, emptySelection())).toEqual([]);
  });

  it("activating a pillar suggests all of its habits", () => {
    const s = togglePillar(catalog, emptySelection(), "p1");
    expect(s.pillars).toEqual(["p1"]);
    expect(selectedTemplateIds(catalog, s)).toEqual(["a", "b"]);
  });

  it("habits can be unchecked inside an active pillar", () => {
    const s = toggleHabit(togglePillar(catalog, emptySelection(), "p1"), "b");
    expect(selectedTemplateIds(catalog, s)).toEqual(["a"]);
    expect(selectedTemplateIds(catalog, toggleHabit(s, "b"))).toEqual(["a", "b"]);
  });

  it("deactivating a pillar drops its habits", () => {
    let s = togglePillar(catalog, emptySelection(), "p1");
    s = togglePillar(catalog, s, "p2");
    s = togglePillar(catalog, s, "p1");
    expect(s.pillars).toEqual(["p2"]);
    expect(selectedTemplateIds(catalog, s)).toEqual(["c"]);
  });

  it("habits of inactive pillars are never returned", () => {
    const s = toggleHabit(emptySelection(), "c");
    expect(selectedTemplateIds(catalog, s)).toEqual([]);
  });

  it("does not mutate the previous selection", () => {
    const before = emptySelection();
    togglePillar(catalog, before, "p1");
    expect(before).toEqual(emptySelection());
  });
});
