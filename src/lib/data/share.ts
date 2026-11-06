import {
  buildSummaryCard,
  type SummaryCardLabels,
  type SummaryCardStats,
} from "../../../supabase/functions/weekly-summary/summary.ts";

export type ShareResult = "shared" | "downloaded" | "cancelled";
export type ShareErrorCode = "canvas_unavailable" | "render_failed" | "share_failed";

/** Typed error for the UI: show a localized text chosen by `code`, never `message`. */
export class ShareError extends Error {
  constructor(readonly code: ShareErrorCode) {
    super(code);
    this.name = "ShareError";
  }
}

type CanvasLike = {
  getContext(type: "2d"): { drawImage(image: unknown, x: number, y: number, w: number, h: number): void } | null;
  toBlob(callback: (blob: Blob | null) => void, type: string): void;
};

export type RasterDeps = {
  loadImage?: (src: string) => Promise<unknown>;
  createCanvas?: (size: number) => CanvasLike | null;
};

export type ShareDeps = {
  /** Defaults to the real `svgToPngBlob`. */
  toPng?: (svg: string, size: number) => Promise<Blob>;
  /** Triggers a file download in the browser. */
  download?: (blob: Blob, filename: string) => void;
  /** Subset of `navigator` used for sharing; undefined means unsupported. */
  navigator?: {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title: string; text: string }) => Promise<void>;
  };
};

export const CARD_SIZE = 1080;

function defaultLoadImage(src: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function defaultCreateCanvas(size: number): CanvasLike | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas as unknown as CanvasLike;
}

/** Rasterizes the SVG into a square PNG blob. Throws `ShareError("canvas_unavailable")` when impossible. */
export async function svgToPngBlob(svg: string, size: number, deps: RasterDeps = {}): Promise<Blob> {
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas;
  const loadImage = deps.loadImage ?? defaultLoadImage;
  const canvas = createCanvas(size);
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) throw new ShareError("canvas_unavailable");
  // A data URL (not a blob URL) keeps the canvas untainted.
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`).catch(() => {
    throw new ShareError("canvas_unavailable");
  });
  ctx.drawImage(image, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch {
      resolve(null);
    }
  });
  if (!blob) throw new ShareError("canvas_unavailable");
  return blob;
}

function defaultDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

/**
 * Shares the card as a PNG file via the Web Share API when files can be shared,
 * otherwise downloads it (the SVG when PNG conversion is unavailable).
 * A dismissed share sheet resolves "cancelled"; other failures throw ShareError.
 */
export async function shareCard(
  input: { svg: string; filename: string; title: string; text: string },
  deps: ShareDeps = {},
): Promise<ShareResult> {
  const toPng = deps.toPng ?? ((svg, size) => svgToPngBlob(svg, size));
  const download = deps.download ?? defaultDownload;
  const nav = "navigator" in deps ? deps.navigator : typeof navigator === "undefined" ? undefined : navigator;

  let png: Blob;
  try {
    png = await toPng(input.svg, CARD_SIZE);
  } catch (e) {
    if (e instanceof ShareError && e.code === "canvas_unavailable") {
      download(new Blob([input.svg], { type: "image/svg+xml" }), input.filename.replace(/\.png$/i, ".svg"));
      return "downloaded";
    }
    throw new ShareError("render_failed");
  }

  const file = new File([png], input.filename, { type: "image/png" });
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: input.title, text: input.text });
      return "shared";
    } catch (e) {
      if (isAbort(e)) return "cancelled";
      throw new ShareError("share_failed");
    }
  }
  download(png, input.filename);
  return "downloaded";
}

/** Card + filename (`lifeathlete-<locale>.png`, no user data) ready for `shareCard`. */
export function buildShareInput(
  stats: SummaryCardStats,
  labels: SummaryCardLabels,
  locale: "pt" | "en",
  copy: { title: string; text: string },
): { svg: string; filename: string; title: string; text: string } {
  return { svg: buildSummaryCard(stats, labels).svg, filename: `lifeathlete-${locale}.png`, ...copy };
}

export type ShareStatus = "idle" | "working" | "shared" | "downloaded" | "error";

/** Runs a share and maps its outcome to a UI status; a dismissed sheet returns to "idle" silently. */
export async function runShare(share: () => Promise<ShareResult>): Promise<ShareStatus> {
  try {
    const result = await share();
    return result === "cancelled" ? "idle" : result;
  } catch {
    return "error";
  }
}

/** Card labels from already-localized strings (`t` for `share.card.*`, `pillar` for pillar names). */
export function cardLabels(t: (key: "title" | "level" | "streak" | "days" | "wheel") => string, pillar: (slug: string) => string, slugs: string[]): SummaryCardLabels {
  return {
    title: t("title"),
    level: t("level"),
    streak: t("streak"),
    days: t("days"),
    wheel: t("wheel"),
    pillars: Object.fromEntries(slugs.map((slug) => [slug, pillar(slug)])),
  };
}
