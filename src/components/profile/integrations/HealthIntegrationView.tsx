"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";
import type { HealthConnection } from "@/lib/data/integrations";
import { safeTimeZone, type IntegrationErrorKey } from "@/lib/health/messages";
import styles from "../profile.module.css";

/** pending = not known yet (server render); none = browser/PWA without the native bridge. */
export type DeviceState = "pending" | "none" | "present";
export type BusyAction = "connect" | "sync" | "disconnect" | null;
export type StatusMessage = {
  key: "status.connected" | "status.synced" | "status.nothing" | "status.disconnected";
  values?: Record<string, number>;
  /** Days logged by hand that the sync left alone. */
  skippedManual?: number;
  /** Steps habits beyond the per-sync limit. */
  habitsIgnored?: number;
};

export type HealthViewProps = {
  device: DeviceState;
  /** null = the connection status could not be loaded. */
  connection: HealthConnection | null;
  /** The profile's IANA timezone (the last sync time is shown in it). */
  timezone: string;
  busy: BusyAction;
  confirming: boolean;
  error: IntegrationErrorKey | null;
  status: StatusMessage | null;
  onConnect: () => void;
  onSync: () => void;
  onAskDisconnect: () => void;
  onCancelDisconnect: () => void;
  onDisconnect: () => void;
  onRetryLoad: () => void;
};

/** Presentational "Passos do telemóvel" card: one state at a time, all copy localized. */
export function HealthIntegrationView(props: HealthViewProps) {
  const t = useTranslations("profile.integrations");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const headingId = useId();
  const { device, connection, busy, status, error } = props;
  const working = busy !== null;

  const statusText = status
    ? [
        t(status.key, status.values),
        status.skippedManual ? t("status.skippedManual", { count: status.skippedManual }) : "",
        status.habitsIgnored ? t("status.habitsIgnored", { count: status.habitsIgnored }) : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  let content;
  if (device === "pending") {
    content = <p aria-busy="true">{t("loading")}</p>;
  } else if (device === "none") {
    content = (
      <>
        <p>{t("unavailable")}</p>
        <p className={styles.hint}>{t("unavailableIos")}</p>
      </>
    );
  } else if (connection === null) {
    content = (
      <div role="alert" className={styles.field}>
        <p className={styles.error}>{t("load")}</p>
        <button type="button" className={styles.button} onClick={props.onRetryLoad}>
          {tCommon("errors.retry")}
        </button>
      </div>
    );
  } else if (connection.status !== "connected") {
    content = (
      <>
        <h3 className={styles.subheading}>{t("consent.title")}</h3>
        <ul className={styles.consent}>
          <li>{t("consent.read")}</li>
          <li>{t("consent.sent")}</li>
          <li>{t("consent.storedWithoutHabit")}</li>
          <li>{t("consent.kept")}</li>
          <li>{t("consent.unverified")}</li>
          <li>{t("consent.use")}</li>
          <li>{t("consent.disconnect")}</li>
        </ul>
        <button
          type="button"
          className={`${styles.button} ${styles.primary} ${styles.block}`}
          aria-busy={busy === "connect"}
          disabled={working}
          onClick={props.onConnect}
        >
          {busy === "connect" ? t("connecting") : t("connect")}
        </button>
      </>
    );
  } else {
    const lastSync = connection.lastSyncedAt
      ? t("lastSync", {
          time: format.dateTime(new Date(connection.lastSyncedAt), {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: safeTimeZone(props.timezone),
          }),
        })
      : t("neverSynced");
    content = (
      <>
        <p>{t("connected")}</p>
        <p>{lastSync}</p>
        <p className={styles.hint}>{t("habitsHint")}</p>
        {props.confirming ? (
          <div role="group" aria-label={t("disconnectLabel")} className={styles.row}>
            <p className={styles.grow}>{t("disconnectConfirm")}</p>
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              aria-busy={busy === "disconnect"}
              disabled={working}
              onClick={props.onDisconnect}
            >
              {busy === "disconnect" ? t("disconnecting") : t("disconnectYes")}
            </button>
            <button type="button" className={styles.button} disabled={working} onClick={props.onCancelDisconnect}>
              {t("disconnectCancel")}
            </button>
          </div>
        ) : (
          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              aria-busy={busy === "sync"}
              disabled={working}
              onClick={props.onSync}
            >
              {busy === "sync" ? t("syncing") : t("syncNow")}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              aria-label={t("disconnectLabel")}
              disabled={working}
              onClick={props.onAskDisconnect}
            >
              {t("disconnect")}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <section className={`${styles.card} ${styles.field}`} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.pillarHeading}>
        {t("stepsTitle")}
      </h2>
      {content}
      <p role="status" className={styles.status}>
        {statusText}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {t(error)}
        </p>
      )}
    </section>
  );
}
