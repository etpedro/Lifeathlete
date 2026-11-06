import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { runSignOut } from "@/lib/auth/sign-out";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { SignOutButton, SignOutButtonView } from "./SignOutButton";

const view = (status: "idle" | "working" | "error") =>
  renderToStaticMarkup(<SignOutButtonView status={status} onSignOut={() => {}} t={(k) => pt.profile.signOut[k]} />);

describe("runSignOut", () => {
  function deps(signOutResult: () => Promise<{ error: unknown }>) {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        signOut: async () => {
          calls.push("signOut");
          return signOutResult();
        },
        clearCaches: async () => void calls.push("clearCaches"),
        navigate: () => void calls.push("navigate"),
      },
    };
  }

  it("signs out, then clears the worker caches, then navigates to login", async () => {
    const d = deps(async () => ({ error: null }));
    expect(await runSignOut(d.deps)).toBe("done");
    expect(d.calls).toEqual(["signOut", "clearCaches", "navigate"]);
  });

  it("an auth error is reported and does not navigate (caches are still cleared)", async () => {
    const d = deps(async () => ({ error: new Error("network") }));
    expect(await runSignOut(d.deps)).toBe("error");
    expect(d.calls).toEqual(["signOut", "clearCaches"]);
  });

  it("a thrown signOut is reported as an error, never as success", async () => {
    const d = deps(() => Promise.reject(new Error("boom")));
    expect(await runSignOut(d.deps)).toBe("error");
    expect(d.calls).not.toContain("navigate");
  });
});

describe("SignOutButtonView", () => {
  it("idle: a real button with visible text and an empty alert region", () => {
    const html = view("idle");
    expect(html).toMatch(new RegExp(`<button type="button"[^>]*>${pt.profile.signOut.button}</button>`));
    expect(html).toContain('aria-busy="false"');
    expect(html).toMatch(/<p role="alert"[^>]*><\/p>/);
  });

  it("working: busy and disabled", () => {
    const html = view("working");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain(pt.profile.signOut.working);
  });

  it("error: shows the localized error and the button is usable again", () => {
    const html = view("error");
    expect(html).toMatch(new RegExp(`<p role="alert"[^>]*>${pt.profile.signOut.failed}</p>`));
    expect(html).not.toContain("disabled");
  });

  it("renders the stateful button localized (EN)", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <SignOutButton locale="en" />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(en.profile.signOut.button);
  });
});
