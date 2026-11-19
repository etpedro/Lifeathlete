// Server-render tests of the sign-in form and OAuth buttons: labels, required, alerts stay.
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { LoginView } from "./LoginForm";
import { OAuthButtonsView } from "./OAuthButtons";
import { ForgotPasswordView } from "./ForgotPasswordForm";

const render = (ui: ReactElement, locale: "pt" | "en" = "pt") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );

const noop = () => {};
const login = (over: Partial<Parameters<typeof LoginView>[0]> = {}) =>
  render(<LoginView mode="signIn" error={null} checkEmail={false} busy={false} onSubmit={noop} onToggleMode={noop} {...over} />);

describe("LoginView", () => {
  it("keeps labelled, required email and password fields", () => {
    const html = login();
    expect(html).toContain(pt.onboarding.login.email);
    expect(html).toContain(pt.onboarding.login.password);
    expect(html).toMatch(/<input[^>]*type="email"[^>]*required=""[^>]*name="email"/);
    expect(html).toMatch(/<input[^>]*type="password"[^>]*required=""[^>]*name="password"/);
    expect(html).toContain('autoComplete="current-password"');
  });

  it("sign-up mode changes the labels and the autocomplete", () => {
    const html = login({ mode: "signUp" });
    expect(html).toContain(pt.onboarding.login.signUp);
    expect(html).toContain('autoComplete="new-password"');
  });

  it("errors are alerts and the invalid fields are flagged", () => {
    const html = login({ error: "invalidCredentials" });
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-invalid="true"');
  });

  it("check-email is a polite status", () => {
    expect(login({ checkEmail: true })).toContain(`<p role="status"`);
  });

  it("the submit is the filled primary and the switch a ghost button: one class each", () => {
    const html = login();
    const submit = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
    const toggle = html.match(/<button[^>]*type="button"[^>]*>/)?.[0] ?? "";
    for (const b of [submit, toggle]) expect((b.match(/class="([^"]*)"/)?.[1] ?? "").split(" ").filter(Boolean)).toHaveLength(1);
    expect(submit).not.toBe(toggle);
    expect(submit.match(/class="([^"]*)"/)?.[1]).not.toBe(toggle.match(/class="([^"]*)"/)?.[1]);
  });

  it("busy disables the submit", () => {
    expect(login({ busy: true })).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});

describe("OAuthButtonsView", () => {
  it("one secondary button per provider, with the failure as an alert", () => {
    const html = render(<OAuthButtonsView failed onSignIn={noop} />, "en");
    expect(html).toContain(en.onboarding.login.google);
    expect(html).toContain(en.onboarding.login.apple);
    expect(html).toContain('role="alert"');
    for (const b of html.match(/<button[^>]*>/g) ?? []) expect((b.match(/class="([^"]*)"/)?.[1] ?? "").split(" ").filter(Boolean)).toHaveLength(1);
  });
});

describe("ForgotPasswordView buttons", () => {
  it("submit carries exactly one (primary) class", () => {
    const html = render(
      <ForgotPasswordView status="idle" onSubmit={noop} labels={{ ...pt.passwordReset.forgot, error: () => "" }} />,
    );
    const submit = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
    expect((submit.match(/class="([^"]*)"/)?.[1] ?? "").split(" ").filter(Boolean)).toHaveLength(1);
  });
});
