// Server-render tests of the integrations screen (no DOM env): what each state shows.
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { HealthIntegration } from "./HealthIntegration";
import { HealthIntegrationView, type HealthViewProps } from "./HealthIntegrationView";

const tt = pt.profile.integrations;
const render = (ui: ReactElement, locale: "pt" | "en" = "pt") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
const noop = () => {};
type Conn = NonNullable<HealthViewProps["connection"]>;
const conn = (over: Partial<Conn> = {}): Conn => ({
  status: "connected",
  lastSyncedAt: null,
  categories: null,
  consentCurrent: null,
  ...over,
});
const metricsPt = pt.profile.metrics;
const ALWAYS = ["read", "sent", "storedWithoutHabit", "kept", "unverified", "use", "disconnect"] as const;
const view = (over: Partial<HealthViewProps> = {}, locale: "pt" | "en" = "pt") =>
  render(
    <HealthIntegrationView
      device="none"
      connection={{ status: "none", lastSyncedAt: null, categories: null, consentCurrent: null }}
      timezone="Europe/Lisbon"
      busy={null}
      confirming={false}
      error={null}
      status={null}
      selected={[]}
      onToggleCategory={noop}
      onConnect={noop}
      onSync={noop}
      onAskDisconnect={noop}
      onCancelDisconnect={noop}
      onDisconnect={noop}
      onRetryLoad={noop}
      {...over}
    />,
    locale,
  );

describe("HealthIntegrationView", () => {
  it("browser without a bridge: explains the Android app, no action buttons", () => {
    const html = view();
    expect(html).toContain(tt.unavailable);
    expect(html).toContain(tt.unavailableIos);
    expect(html).not.toContain("<button");
    expect(html).toContain('role="status"');
  });

  it("is the same in the browser even if a connection exists (no buttons that do nothing)", () => {
    const html = view({ connection: conn({ lastSyncedAt: "2026-11-08T09:00:00Z" }) });
    expect(html).toContain(tt.unavailable);
    expect(html).not.toContain(tt.syncNow);
  });

  it("checking the device: a busy placeholder", () => {
    expect(view({ device: "pending" })).toContain('aria-busy="true"');
  });

  it("the v3 consent text describes reading, storage and use accurately (PT and EN)", () => {
    expect(Object.keys(tt.consent)).toEqual([
      "title",
      "choose",
      "pickOne",
      "read",
      "sent",
      "storedWithoutHabit",
      "kept",
      "unverified",
      "use",
      "disconnect",
      "renew",
    ]);
    const ten = en.profile.integrations.consent;
    expect(tt.consent.read).toContain("apenas as categorias que escolheres");
    expect(ten.read).toContain("only the categories you choose");
    expect(tt.consent.sent).toContain("últimos 7 dias");
    expect(ten.sent).toContain("last 7 days");
    expect(tt.consent.storedWithoutHabit).toContain("mesmo que");
    expect(ten.storedWithoutHabit).toContain("even if");
    expect(tt.consent.kept).toContain("depois de desligares");
    expect(ten.kept).toContain("after you disconnect");
    expect(tt.consent.unverified).toContain("não são verificados");
    expect(ten.unverified).toContain("not verified");
    expect(tt.consent.disconnect).toContain("histórico já importado é mantido");
    // no promise of a deletion feature that does not exist
    for (const text of [...Object.values(tt.consent), ...Object.values(ten)]) {
      expect(text).not.toMatch(/apag|elimin|delet|remov|erase/i);
    }
  });

  it("each category has a name and a one-line description of what is read", () => {
    for (const locale of [pt, en]) {
      const m = locale.profile.metrics;
      expect(Object.keys(m)).toEqual(["steps", "workout_minutes", "sleep_hours", "mindful_minutes"]);
      for (const v of Object.values(m)) {
        expect(v.name).toBeTruthy();
        expect(v.reads).toBeTruthy();
        expect(v.reads).not.toContain("\n");
      }
    }
    expect(metricsPt.steps.reads).toContain("total diário de passos");
    expect(metricsPt.workout_minutes.reads).toContain("duração total dos treinos");
    expect(metricsPt.sleep_hours.reads).toContain("duração do sono");
    expect(metricsPt.mindful_minutes.reads).toContain("meditação");
  });

  it("bridge present, not connected: consent text, four unchecked checkboxes, connect disabled until one is ticked", () => {
    for (const status of ["none", "disconnected"] as const) {
      const html = view({ device: "present", connection: conn({ status }) });
      for (const key of ALWAYS) expect(html).toContain(tt.consent[key]);
      expect(html).toContain(tt.consent.choose);
      expect(html).not.toContain(tt.consent.renew);
      expect(html.match(/type="checkbox"/g)).toHaveLength(4);
      expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
      for (const m of Object.values(metricsPt)) {
        expect(html).toContain(m.name);
        expect(html).toContain(m.reads);
      }
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(html).toMatch(new RegExp(`<button type="button"[^>]*disabled=""[^>]*>${tt.connect}</button>`));
      expect(html).toContain(tt.consent.pickOne);
      expect(html).not.toContain(tt.syncNow);
    }
  });

  it("ticked categories are checked and enable the connect button", () => {
    const html = view({ device: "present", connection: conn({ status: "none" }), selected: ["steps", "sleep_hours"] });
    expect(html.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(2);
    expect(html).toMatch(new RegExp(`<button type="button"[^>]*>${tt.connect}</button>`));
    expect(html).not.toMatch(new RegExp(`disabled=""[^>]*>${tt.connect}<`));
    expect(html).not.toContain(tt.consent.pickOne);
  });

  it("a connection whose consent is not current (a v2 steps-only one) asks again", () => {
    const html = view({ device: "present", connection: conn({ categories: ["steps"], consentCurrent: false }) });
    expect(html).toContain(tt.consent.renew);
    expect(html).toContain(tt.connect);
    expect(html).not.toContain(tt.syncNow);
  });

  it("connecting: busy, disabled, with progress text", () => {
    const html = view({ device: "present", busy: "connect" });
    expect(html).toContain(tt.connecting);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  it("connected: last sync localized in the profile timezone, sync now and disconnect", () => {
    const html = view({ device: "present", connection: conn({ lastSyncedAt: "2026-11-08T23:30:00Z", consentCurrent: true }) });
    expect(html).toContain(tt.connected);
    expect(html).toContain(tt.syncNow);
    expect(html).toContain(tt.disconnect);
    expect(html).toContain("Última sincronização:");
    expect(html).toContain("23:30"); // Lisbon is UTC+0 in November
    const tokyo = view({
      device: "present",
      timezone: "Asia/Tokyo",
      connection: conn({ lastSyncedAt: "2026-11-08T23:30:00Z" }),
    });
    expect(tokyo).toContain("08:30");
    expect(html).not.toContain(tt.disconnectYes); // confirmation is a separate step
  });

  it("connected: lists the consented categories (only once they are known)", () => {
    const html = view({ device: "present", connection: conn({ categories: ["steps", "sleep_hours"], consentCurrent: true }) });
    expect(html).toContain("A ler: Passos e Horas de sono.");
    const enHtml = view(
      { device: "present", connection: conn({ categories: ["workout_minutes"], consentCurrent: true }) },
      "en",
    );
    expect(enHtml).toContain("Reading: Workout minutes.");
    expect(view({ device: "present", connection: conn() })).not.toContain("A ler:");
  });

  it("connected but never synced, and an invalid timezone does not crash", () => {
    expect(view({ device: "present", connection: conn() })).toContain(tt.neverSynced);
    const bad = view({
      device: "present",
      timezone: "Not/AZone",
      connection: conn({ lastSyncedAt: "2026-11-08T23:30:00Z" }),
    });
    expect(bad).toContain("23:30");
  });

  it("disconnect needs a confirmation step", () => {
    const html = view({ device: "present", confirming: true, connection: conn() });
    expect(html).toContain(tt.disconnectConfirm);
    expect(html).toContain(tt.disconnectYes);
    expect(html).toContain(tt.disconnectCancel);
    expect(html).toContain(`aria-label="${tt.disconnectLabel}"`);
  });

  it("shows inline localized errors and statuses", () => {
    const html = view({ device: "present", error: "errors.network" });
    expect(html).toMatch(new RegExp(`role="alert"[^>]*>${tt.errors.network}<`));
    const synced = view({
      device: "present",
      connection: conn(),
      status: { key: "status.synced", values: { days: 3 } },
    });
    expect(synced).toMatch(/role="status"[^>]*>3 dias sincronizados\.</);
    const capped = view({
      device: "present",
      connection: conn(),
      status: { key: "status.synced", values: { days: 7 }, habitsIgnored: 2 },
    });
    expect(capped).toContain("2 hábitos além do limite de 50");
  });

  it("a failed load shows an alert with retry", () => {
    const html = view({ device: "present", connection: null });
    expect(html).toContain(tt.load);
    expect(html).toContain(pt.common.errors.retry);
  });

  it("renders in English", () => {
    const html = view({ device: "present" }, "en");
    expect(html).toContain(en.profile.integrations.connect);
    expect(html).toContain(en.profile.integrations.consent.unverified);
    expect(html).toContain(en.profile.integrations.consent.kept);
    expect(html).toContain(en.profile.metrics.sleep_hours.reads);
  });
});

describe("HealthIntegration (first paint)", () => {
  it("renders without a bridge on the server (no crash, no actions)", () => {
    const html = render(<HealthIntegration timezone="UTC" initial={{ status: "none", lastSyncedAt: null }} />);
    expect(html).toContain(tt.phoneTitle);
    expect(html).not.toContain(tt.connect);
  });
});
