"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  disconnectHealth,
  getHealthConnection,
  getHealthStatus,
  HealthError,
  type HealthConnection,
} from "@/lib/data/integrations";
import { getHealthBridge, type HealthBridge } from "@/lib/health/bridge";
import { healthErrorKey, type IntegrationErrorKey } from "@/lib/health/messages";
import type { AutoMetric } from "@/lib/health/metrics";
import { connectAndSync, runHealthSync, type HealthSyncOutcome } from "@/lib/health/sync";
import { createClient } from "@/lib/supabase/client";
import type { Db } from "@/lib/supabase/types";
import {
  HealthIntegrationView,
  type BusyAction,
  type HealthView,
  type StatusMessage,
} from "./HealthIntegrationView";

const subscribe = () => () => {};

/** The native bridge on the client; undefined while server rendering (not known yet). */
function useHealthBridge(): HealthBridge | null | undefined {
  return useSyncExternalStore(subscribe, getHealthBridge, () => undefined);
}

type Props = {
  /** The profile's IANA timezone: local "today" for the sync and the last sync display. */
  timezone: string;
  /** Server-loaded connection (granted columns only); null when it could not be loaded. */
  initial: HealthConnection | null;
};

const unknownConsent = (c: HealthConnection): HealthView => ({ ...c, categories: null, consentCurrent: null });

/**
 * "Dados do telemóvel": consent per category, connect, sync now and disconnect, one action
 * at a time. The consented categories are server-side only, so with a bridge the screen
 * asks the function (`status` action) and shows what the server recorded.
 */
export function HealthIntegration({ timezone, initial }: Props) {
  const bridge = useHealthBridge();
  const [connection, setConnection] = useState<HealthView | null>(initial && unknownConsent(initial));
  const [selected, setSelected] = useState<AutoMetric[]>([]);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<IntegrationErrorKey | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const dbRef = useRef<Db | null>(null);
  const busyRef = useRef(false);
  const db = useCallback(() => (dbRef.current ??= createClient()), []);

  const device = bridge === undefined ? "pending" : bridge?.isAvailable() ? "present" : "none";

  // The truthful connected categories after a reload (best effort: the card still works without).
  useEffect(() => {
    if (device !== "present") return;
    let live = true;
    getHealthStatus(db()).then(
      (s) => live && setConnection(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [device, db]);

  const run = async (action: Exclude<BusyAction, null>, work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setError(null);
    setStatus(null);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const applySync = (outcome: HealthSyncOutcome, fallback: StatusMessage) => {
    if (!outcome.ok) {
      // The server no longer accepts this consent: show the consent step again.
      if (outcome.code === "consent_required") setConnection((c) => c && { ...c, consentCurrent: false });
      setError(healthErrorKey(outcome.code));
      return;
    }
    const result = outcome.result;
    if (!result) return setStatus(fallback);
    setConnection((c) => c && { ...c, status: "connected", lastSyncedAt: result.lastSyncedAt ?? c.lastSyncedAt });
    setStatus({
      key: "status.synced",
      values: { days: result.days },
      skippedManual: result.skippedManual,
      habitsIgnored: result.habitsIgnored,
    });
  };

  const deps = (b: HealthBridge) => ({ db: db(), bridge: b, now: new Date(), timezone });

  /** The consented categories: known locally, else asked from the server. */
  const consented = async (): Promise<AutoMetric[]> => {
    if (connection?.categories) return connection.categories;
    const s = await getHealthStatus(db());
    setConnection(s);
    return s.consentCurrent ? s.categories : [];
  };

  return (
    <HealthIntegrationView
      device={device}
      connection={connection}
      timezone={timezone}
      busy={busy}
      confirming={confirming}
      error={error}
      status={status}
      selected={selected}
      onToggleCategory={(m) => setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))}
      onConnect={() =>
        bridge &&
        void run("connect", async () => {
          const out = await connectAndSync(deps(bridge), selected);
          if (!out.connected) return setError(healthErrorKey(out.code));
          setConnection((c) => ({
            status: "connected",
            lastSyncedAt: c?.lastSyncedAt ?? null,
            categories: out.categories,
            consentCurrent: true,
          }));
          setSelected([]);
          applySync(out.sync, { key: "status.connected" });
        })
      }
      onSync={() =>
        bridge &&
        void run("sync", async () => {
          let categories: AutoMetric[];
          try {
            categories = await consented();
          } catch (e) {
            return setError(healthErrorKey(e instanceof HealthError ? e.code : "sync_failed"));
          }
          applySync(await runHealthSync({ ...deps(bridge), categories }), { key: "status.nothing" });
        })
      }
      onAskDisconnect={() => setConfirming(true)}
      onCancelDisconnect={() => setConfirming(false)}
      onDisconnect={() =>
        void run("disconnect", async () => {
          try {
            await disconnectHealth(db());
            setConnection((c) => c && { ...c, status: "disconnected" });
            setStatus({ key: "status.disconnected" });
          } catch (e) {
            setError(healthErrorKey(e instanceof HealthError ? e.code : "sync_failed"));
          } finally {
            setConfirming(false);
          }
        })
      }
      onRetryLoad={() =>
        void getHealthConnection(db()).then(
          (c) => setConnection(unknownConsent(c)),
          () => setError("errors.syncFailed"),
        )
      }
    />
  );
}
