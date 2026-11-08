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
const view = (over: Partial<HealthViewProps> = {}, locale: "pt" | "en" = "pt") =>
  render(
    <HealthIntegrationView
      device="none"
      connection={{ status: "none", lastSyncedAt: null }}
      timezone="Europe/Lisbon"
      busy={null}
      confirming={false}
      error={null}
      status={null}
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
    const html = view({ connection: { status: "connected", lastSyncedAt: "2026-11-08T09:00:00Z" } });
    expect(html).toContain(tt.unavailable);
    expect(html).not.toContain(tt.syncNow);
  });

  it("checking the device: a busy placeholder", () => {
    expect(view({ device: "pending" })).toContain('aria-busy="true"');
  });

  it("the consent text describes storage accurately (kept after disconnect, stored without a habit)", () => {
    expect(Object.keys(tt.consent)).toEqual([
      "title",
      "read",
      "sent",
      "storedWithoutHabit",
      "kept",
      "unverified",
      "use",
      "disconnect",
    ]);
    expect(tt.consent.sent).toContain("últimos 7 dias");
    expect(tt.consent.kept).toContain("depois de desligares");
    expect(en.profile.integrations.consent.kept).toContain("after you disconnect");
    expect(en.profile.integrations.consent.storedWithoutHabit).toContain("even if");
    // no promise of a deletion feature that does not exist
    for (const text of [...Object.values(tt.consent), ...Object.values(en.profile.integrations.consent)]) {
      expect(text).not.toMatch(/apag|elimin|delet|remov/i);
    }
  });

  it("bridge present, not connected: the full consent text and one primary connect button", () => {
    for (const status of ["none", "disconnected"] as const) {
      const html = view({ device: "present", connection: { status, lastSyncedAt: null } });
      for (const line of Object.values(tt.consent)) expect(html).toContain(line);
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(html).toMatch(new RegExp(`<button type="button"[^>]*>${tt.connect}</button>`));
      expect(html).not.toContain(tt.syncNow);
    }
  });

  it("connecting: busy, disabled, with progress text", () => {
    const html = view({ device: "present", busy: "connect" });
    expect(html).toContain(tt.connecting);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  it("connected: last sync localized in the profile timezone, sync now and disconnect", () => {
    const html = view({ device: "present", connection: { status: "connected", lastSyncedAt: "2026-11-08T23:30:00Z" } });
    expect(html).toContain(tt.connected);
    expect(html).toContain(tt.syncNow);
    expect(html).toContain(tt.disconnect);
    expect(html).toContain("Última sincronização:");
    expect(html).toContain("23:30"); // Lisbon is UTC+0 in November
    const tokyo = view({
      device: "present",
      timezone: "Asia/Tokyo",
      connection: { status: "connected", lastSyncedAt: "2026-11-08T23:30:00Z" },
    });
    expect(tokyo).toContain("08:30");
    expect(html).not.toContain(tt.disconnectYes); // confirmation is a separate step
  });

  it("connected but never synced, and an invalid timezone does not crash", () => {
    expect(view({ device: "present", connection: { status: "connected", lastSyncedAt: null } })).toContain(tt.neverSynced);
    const bad = view({
      device: "present",
      timezone: "Not/AZone",
      connection: { status: "connected", lastSyncedAt: "2026-11-08T23:30:00Z" },
    });
    expect(bad).toContain("23:30");
  });

  it("disconnect needs a confirmation step", () => {
    const html = view({ device: "present", confirming: true, connection: { status: "connected", lastSyncedAt: null } });
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
      connection: { status: "connected", lastSyncedAt: null },
      status: { key: "status.synced", values: { days: 3 } },
    });
    expect(synced).toMatch(/role="status"[^>]*>3 dias sincronizados\.</);
    const capped = view({
      device: "present",
      connection: { status: "connected", lastSyncedAt: null },
      status: { key: "status.synced", values: { days: 7 }, habitsIgnored: 2 },
    });
    expect(capped).toContain("2 hábitos além do limite de 20");
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
  });
});

describe("HealthIntegration (first paint)", () => {
  it("renders without a bridge on the server (no crash, no actions)", () => {
    const html = render(<HealthIntegration timezone="UTC" initial={{ status: "none", lastSyncedAt: null }} />);
    expect(html).not.toContain(tt.connect);
  });
});
