import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { ForgotPasswordView, type ForgotStatus } from "./ForgotPasswordForm";
import { ResetPasswordView, type ResetStatus } from "./ResetPasswordForm";

const esc = (s: string) => s.replace(/'/g, "&#x27;");
const wrap = (node: ReactNode, locale: "pt" | "en" = "pt") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );

const forgot = (status: ForgotStatus, m = pt) => {
  const f = m.passwordReset.forgot;
  return wrap(
    <ForgotPasswordView
      status={status}
      onSubmit={() => {}}
      labels={{ ...f, error: (k) => m.passwordReset.errors[k] }}
    />,
  );
};

const reset = (status: ResetStatus, m = pt, locale: "pt" | "en" = "pt") => {
  const u = m.passwordReset.update;
  return wrap(
    <ResetPasswordView status={status} onSubmit={() => {}} labels={{ ...u, error: (k) => m.passwordReset.errors[k] }} />,
    locale,
  );
};

describe("ForgotPasswordView", () => {
  it("'sent' is a polite status that does not say whether the account exists", () => {
    const html = forgot("sent");
    expect(html).toContain(`<p role="status">${pt.passwordReset.forgot.sent}</p>`);
    expect(html).toContain('<p role="alert"></p>');
    expect(esc(forgot("sent", en))).toContain(esc(en.passwordReset.forgot.sent));
  });

  it("shows localized errors as alerts and is busy while sending", () => {
    expect(forgot("rateLimited")).toContain(`<p role="alert">${pt.passwordReset.errors.rateLimited}</p>`);
    expect(forgot("invalidEmail")).toContain('aria-invalid="true"');
    expect(forgot("working")).toMatch(/<button type="submit" disabled="">/);
    expect(forgot("working")).toContain(pt.passwordReset.forgot.submitting);
  });
});

describe("ResetPasswordView", () => {
  it("labelled password + confirmation with the length hint wired to the field", () => {
    const html = reset("idle");
    expect(html).toContain(pt.passwordReset.update.password);
    expect(html).toContain(pt.passwordReset.update.confirm);
    expect(html).toMatch(/aria-describedby="new-password-hint"/);
    expect(html).toContain(`<p id="new-password-hint">${pt.passwordReset.update.hint}</p>`);
  });

  it("validation and backend errors are localized alerts on the right field", () => {
    expect(reset("mismatch")).toContain(`<p role="alert">${pt.passwordReset.errors.mismatch}</p>`);
    expect(reset("mismatch")).toMatch(/<input[^>]*aria-invalid="true"[^>]*name="confirm"/);
    expect(reset("tooShort")).toMatch(/<input[^>]*aria-invalid="true"[^>]*name="password"/);
    expect(reset("same")).toContain(pt.passwordReset.errors.same);
  });

  it("an expired recovery session offers a new link", () => {
    expect(reset("expired")).toContain('href="/pt/auth/forgot-password"');
  });

  it("success: a status message and a link to Today in the locale", () => {
    const html = reset("done", en, "en");
    expect(html).toContain(`<p role="status">${en.passwordReset.update.success}</p>`);
    expect(html).toContain('href="/en/today"');
    expect(html).not.toContain("<form");
  });
});
