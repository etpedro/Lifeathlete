import { describe, expect, it, vi } from "vitest";
import { buildShareInput, shareCard, ShareError, svgToPngBlob, type ShareDeps } from "./share";

const input = { svg: "<svg/>", filename: "lifeathlete-pt.png", title: "T", text: "X" };
const png = new Blob(["png"], { type: "image/png" });

function deps(over: Partial<ShareDeps> = {}): ShareDeps & { download: ReturnType<typeof vi.fn> } {
  const download = vi.fn();
  return { toPng: async () => png, download, navigator: undefined, ...over } as never;
}

describe("shareCard", () => {
  it("shares a PNG file via the Web Share API when canShare allows files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const d = deps({ navigator: { canShare: () => true, share } });
    expect(await shareCard(input, d)).toBe("shared");
    const arg = share.mock.calls[0][0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].name).toBe("lifeathlete-pt.png");
    expect(arg.files[0].type).toBe("image/png");
    expect(arg.title).toBe("T");
    expect(d.download).not.toHaveBeenCalled();
  });

  it.each([
    ["canShare false", { canShare: () => false, share: vi.fn() }],
    ["canShare missing", { share: vi.fn() }],
    ["no navigator.share support", undefined],
  ])("downloads the PNG when %s", async (_n, nav) => {
    const d = deps({ navigator: nav as never });
    expect(await shareCard(input, d)).toBe("downloaded");
    expect(d.download).toHaveBeenCalledWith(png, "lifeathlete-pt.png");
    if (nav) expect(nav.share).not.toHaveBeenCalled();
  });

  it("resolves 'cancelled' silently when the user dismisses the share sheet", async () => {
    const abort = Object.assign(new Error("dismissed"), { name: "AbortError" });
    const d = deps({ navigator: { canShare: () => true, share: vi.fn().mockRejectedValue(abort) } });
    expect(await shareCard(input, d)).toBe("cancelled");
    expect(d.download).not.toHaveBeenCalled();
  });

  it("throws a typed error without the raw message for other failures", async () => {
    const d = deps({ navigator: { canShare: () => true, share: vi.fn().mockRejectedValue(new Error("secret internals")) } });
    const err = await shareCard(input, d).catch((e) => e);
    expect(err).toBeInstanceOf(ShareError);
    expect(err.code).toBe("share_failed");
    expect(err.message).not.toContain("secret");
  });

  it("falls back to downloading the SVG when PNG conversion is unavailable", async () => {
    const d = deps({ toPng: async () => Promise.reject(new ShareError("canvas_unavailable")) });
    expect(await shareCard(input, d)).toBe("downloaded");
    const [blob, name] = d.download.mock.calls[0];
    expect(name).toBe("lifeathlete-pt.svg");
    expect(blob.type).toBe("image/svg+xml");
  });

  it("throws a typed error when rendering fails for another reason", async () => {
    const d = deps({ toPng: async () => Promise.reject(new Error("boom")) });
    await expect(shareCard(input, d)).rejects.toMatchObject({ code: "render_failed" });
  });
});

describe("svgToPngBlob", () => {
  it("draws the SVG on a square canvas and returns the PNG blob", async () => {
    const drawImage = vi.fn();
    const canvas = {
      getContext: () => ({ drawImage }),
      toBlob: (cb: (b: Blob | null) => void) => cb(png),
    };
    const createCanvas = vi.fn().mockReturnValue(canvas);
    const loadImage = vi.fn().mockResolvedValue({});
    expect(await svgToPngBlob("<svg/>", 1080, { createCanvas, loadImage })).toBe(png);
    expect(createCanvas).toHaveBeenCalledWith(1080);
    expect(loadImage.mock.calls[0][0]).toMatch(/^data:image\/svg\+xml/);
    expect(drawImage).toHaveBeenCalledWith({}, 0, 0, 1080, 1080);
  });

  it("reports canvas_unavailable when there is no canvas or 2d context or blob", async () => {
    const loadImage = async () => ({});
    await expect(svgToPngBlob("<svg/>", 10, { createCanvas: () => null, loadImage })).rejects.toMatchObject({ code: "canvas_unavailable" });
    await expect(
      svgToPngBlob("<svg/>", 10, { createCanvas: () => ({ getContext: () => null, toBlob: () => {} }), loadImage }),
    ).rejects.toMatchObject({ code: "canvas_unavailable" });
    await expect(
      svgToPngBlob("<svg/>", 10, {
        createCanvas: () => ({ getContext: () => ({ drawImage() {} }), toBlob: (cb) => cb(null) }),
        loadImage,
      }),
    ).rejects.toMatchObject({ code: "canvas_unavailable" });
  });
});

describe("buildShareInput", () => {
  const labels = { title: "t", level: "Level", streak: "Streak", days: "days", wheel: "w", pillars: { exercise: "Exercise" } };
  it("composes the card and a filename with no user data", () => {
    const out = buildShareInput({ level: 3, streak: 4, scores: { exercise: 50 } }, labels, "en", { title: "T", text: "X" });
    expect(out.filename).toBe("lifeathlete-en.png");
    expect(out.svg).toContain("<svg");
    expect(out.svg).toContain("Exercise");
    expect(out.title).toBe("T");
    expect(out.text).toBe("X");
  });
});
