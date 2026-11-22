import { Capacitor, registerPlugin } from "@capacitor/core";
import { registerHealthBridge, type HealthBridge } from "./bridge";
import { isAutoMetric, knownMetrics, metricValue, type AutoMetric } from "./metrics";

/**
 * The native Capacitor plugin over Health Connect (implemented in Kotlin, plugin name
 * "HealthConnectBridge"). Read-only. This shape is the contract of that plugin.
 */
export type HealthConnectBridgePlugin = {
  isAvailable(): Promise<{ available: boolean; unavailableCategories: AutoMetric[] }>;
  checkPermissions(o: { categories: AutoMetric[] }): Promise<{ granted: AutoMetric[] }>;
  requestPermissions(o: { categories: AutoMetric[] }): Promise<{ granted: AutoMetric[] }>;
  readMetrics(o: {
    days: number;
    categories: AutoMetric[];
  }): Promise<{ days: { date: string; metrics: Partial<Record<AutoMetric, number>> }[] }>;
};

type DayMetrics = { date: string; metrics: Partial<Record<AutoMetric, number>> };

/** idle = not checked (browser, or not started yet); pending = asking the plugin; ready = bridge registered. */
export type NativeStatus = "idle" | "pending" | "ready" | "unavailable";
export type DeviceState = "pending" | "none" | "present" | "needsHealthConnect";

let nativeStatus: NativeStatus = "idle";
const statusListeners = new Set<() => void>();

function setNativeStatus(next: NativeStatus): void {
  if (nativeStatus === next) return;
  nativeStatus = next;
  for (const listener of [...statusListeners]) {
    try {
      listener();
    } catch {
      // A failing subscriber must not stop the others.
    }
  }
}

export const getNativeStatus = (): NativeStatus => nativeStatus;

export function subscribeNativeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/**
 * What the integrations card shows. `bridge` undefined = not known yet (server). In the
 * Android shell a missing bridge is only "Health Connect missing/outdated" once the
 * native check settled as unavailable; before that it is still being checked.
 */
export function deviceState(o: {
  bridge: HealthBridge | null | undefined;
  nativeShell: boolean;
  status: NativeStatus;
}): DeviceState {
  if (o.bridge === undefined) return "pending";
  if (o.bridge?.isAvailable()) return "present";
  if (!o.nativeShell) return "none";
  return o.status === "unavailable" ? "needsHealthConnect" : "pending";
}

/** True when running inside the Capacitor (Android) shell. */
export function isNativeShell(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Keeps only valid days: known asked metrics, valid values, unique dates, at least one metric. */
function sanitizeDays(raw: unknown, asked: readonly AutoMetric[]): DayMetrics[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DayMetrics[] = [];
  for (const day of raw) {
    const date = day?.date;
    if (typeof date !== "string" || seen.has(date)) continue;
    const source = day.metrics;
    if (typeof source !== "object" || source === null) continue;
    const metrics: Partial<Record<AutoMetric, number>> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!isAutoMetric(key) || !asked.includes(key)) continue;
      const v = metricValue(key, value);
      if (v !== null) metrics[key] = v;
    }
    if (Object.keys(metrics).length === 0) continue;
    seen.add(date);
    out.push({ date, metrics });
  }
  return out;
}

/** A HealthBridge over the plugin; `unavailable` categories are never asked of the plugin. */
export function createCapacitorHealthBridge(
  plugin: HealthConnectBridgePlugin,
  unavailable: readonly AutoMetric[],
): HealthBridge {
  const usable = (categories: AutoMetric[]) => knownMetrics(categories).filter((m) => !unavailable.includes(m));
  return {
    isAvailable: () => true,
    async requestPermission(categories) {
      const asked = usable(categories);
      if (asked.length === 0) return [];
      const { granted } = await plugin.requestPermissions({ categories: asked });
      return knownMetrics(granted).filter((m) => asked.includes(m));
    },
    async readMetrics(days, categories) {
      const asked = usable(categories);
      if (asked.length === 0) return [];
      const res = await plugin.readMetrics({ days, categories: asked });
      return sanitizeDays(res?.days, asked);
    },
  };
}

/**
 * In the Android shell, asks the plugin whether Health Connect is usable and, if so,
 * registers the bridge. Resolves true when a bridge was registered.
 */
export async function registerNativeHealthBridge(
  deps: { isNative?: () => boolean; plugin?: HealthConnectBridgePlugin } = {},
): Promise<boolean> {
  if (!(deps.isNative ?? isNativeShell)()) {
    setNativeStatus("idle");
    return false;
  }
  setNativeStatus("pending");
  try {
    const plugin = deps.plugin ?? registerPlugin<HealthConnectBridgePlugin>("HealthConnectBridge");
    const { available, unavailableCategories } = await plugin.isAvailable();
    if (!available) {
      setNativeStatus("unavailable");
      return false;
    }
    registerHealthBridge(createCapacitorHealthBridge(plugin, knownMetrics(unavailableCategories)));
    setNativeStatus("ready");
    return true;
  } catch {
    setNativeStatus("unavailable");
    return false;
  }
}
