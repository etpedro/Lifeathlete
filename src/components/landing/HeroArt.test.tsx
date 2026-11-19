import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroArt } from "./HeroArt";

describe("HeroArt", () => {
  it("gradient id is unique per instance and the polygon references its own gradient", () => {
    const html = renderToStaticMarkup(
      <>
        <HeroArt mascotLabel="a" />
        <HeroArt mascotLabel="b" />
      </>,
    );
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    const refs = [...html.matchAll(/fill="url\(#([^)]+)\)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(refs.filter((r) => ids.includes(r))).toEqual(ids);
    for (const id of ids) expect(id).not.toContain(":");
  });
});
