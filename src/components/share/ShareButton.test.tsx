import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { runShare, ShareError, type ShareStatus } from "@/lib/data/share";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { ShareButton, ShareButtonView } from "./ShareButton";

const tpt = (k: keyof typeof pt.share & ("button" | "working" | "shared" | "downloaded" | "failed")) => pt.share[k];
const view = (status: ShareStatus) => renderToStaticMarkup(<ShareButtonView status={status} onShare={() => {}} t={tpt} />);

describe("ShareButtonView", () => {
  it("idle: visible text, not busy, empty polite status region", () => {
    const html = view("idle");
    expect(html).toContain(`>${pt.share.button}</button>`);
    expect(html).toContain('aria-busy="false"');
    expect(html).toMatch(/<p role="status"[^>]*><\/p>/);
  });
  it("working: aria-busy and disabled with working text", () => {
    const html = view("working");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain(pt.share.working);
  });
  it.each([
    ["shared", pt.share.shared],
    ["downloaded", pt.share.downloaded],
    ["error", pt.share.failed],
  ] as const)("%s shows its message in the status region", (status, message) => {
    expect(view(status)).toMatch(new RegExp(`<p role="status"[^>]*>${message}</p>`));
  });
  it("renders the stateful button localized (EN)", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ShareButton stats={{ level: 1, streak: 0, scores: {} }} labels={{ title: "", level: "", streak: "", days: "", wheel: "", pillars: {} }} locale="en" />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(en.share.button);
  });
});

describe("runShare", () => {
  it("maps outcomes to statuses; a dismissed sheet is silent", async () => {
    expect(await runShare(async () => "shared")).toBe("shared");
    expect(await runShare(async () => "downloaded")).toBe("downloaded");
    expect(await runShare(async () => "cancelled")).toBe("idle");
  });
  it("maps any failure to the error status, never exposing the raw message", async () => {
    expect(await runShare(async () => Promise.reject(new ShareError("share_failed")))).toBe("error");
    expect(view(await runShare(async () => Promise.reject(new Error("raw secret"))))).not.toContain("raw secret");
  });
});
