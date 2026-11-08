"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { disconnectHealth, getHealthConnection, HealthError, type HealthConnection } from "@/lib/data/integrations";
import { getHealthBridge, type HealthBridge } from "@/lib/health/bridge";
import { healthErrorKey, type IntegrationErrorKey } from "@/lib/health/messages";
import { connectAndSync, runHealthSync, type HealthSyncOutcome } from "@/lib/health/sync";
import { createClient } from "@/lib/supabase/client";
import type { Db } from "@/lib/supabase/types";
import { HealthIntegrationView, type BusyAction, type StatusMessage } from "./HealthIntegrationView";

const subscribe = () => () => {};

/** The native bridge on the client; undefined while server rendering (not known yet). */
function useHealthBridge(): HealthBridge | null | undefined {
  return useSyncExternalStore(subscribe, getHealthBridge, () => undefined);
}

type Props = {
  /** The profile's IANA timezone: local "today" for the sync and the last sync display. */
  timezone: string;
  /** Server-loaded connection; null when it could not be loaded. */
  initial: HealthConnection | null;
};

/** "Passos do telemóvel": consent, connect, sync now and disconnect, one action at a time. */
export function HealthIntegration({ timezone, initial }: Props) {
  const bridge = useHealthBridge();
  const [connection, setConnection] = useState<HealthConnection | null>(initial);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<IntegrationErrorKey | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const dbRef = useRef<Db | null>(null);
  const busyRef = useRef(false);
  const db = useCallback(() => (dbRef.current ??= createClient()), []);

  const device = bridge === undefined ? "pending" : bridge?.isAvailable() ? "present" : "none";

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
      if (outcome.code === "consent_required") {
        setConnection((c) => ({ status: "disconnected", lastSyncedAt: c?.lastSyncedAt ?? null }));
      }
      setError(healthErrorKey(outcome.code));
      return;
    }
    const result = outcome.result;
    if (!result) return setStatus(fallback);
    setConnection((c) => ({ status: "connected", lastSyncedAt: result.lastSyncedAt ?? c?.lastSyncedAt ?? null }));
    setStatus({
      key: "status.synced",
      values: { days: result.days },
      skippedManual: result.skippedManual,
      habitsIgnored: result.habitsIgnored,
    });
  };

  const deps = (b: HealthBridge) => ({ db: db(), bridge: b, now: new Date(), timezone });

  return (
    <HealthIntegrationView
      device={device}
      connection={connection}
      timezone={timezone}
      busy={busy}
      confirming={confirming}
      error={error}
      status={status}
      onConnect={() =>
        bridge &&
        void run("connect", async () => {
          const out = await connectAndSync(deps(bridge));
          if (!out.connected) return setError(healthErrorKey(out.code));
          setConnection((c) => ({ status: "connected", lastSyncedAt: c?.lastSyncedAt ?? null }));
          applySync(out.sync, { key: "status.connected" });
        })
      }
      onSync={() =>
        bridge && void run("sync", async () => applySync(await runHealthSync(deps(bridge)), { key: "status.nothing" }))
      }
      onAskDisconnect={() => setConfirming(true)}
      onCancelDisconnect={() => setConfirming(false)}
      onDisconnect={() =>
        void run("disconnect", async () => {
          try {
            await disconnectHealth(db());
            setConnection((c) => ({ status: "disconnected", lastSyncedAt: c?.lastSyncedAt ?? null }));
            setStatus({ key: "status.disconnected" });
          } catch (e) {
            setError(healthErrorKey(e instanceof HealthError ? e.code : "sync_failed"));
          } finally {
            setConfirming(false);
          }
        })
      }
      onRetryLoad={() =>
        void getHealthConnection(db()).then(setConnection, () => setError("errors.syncFailed"))
      }
    />
  );
}
