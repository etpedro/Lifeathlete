import type { AutoMetric } from "./metrics";

/**
 * The native health bridge (automatic data collection). No native code ships yet: in the
 * browser and the installed PWA there is no bridge, so `getHealthBridge()` is null and
 * the UI only explains that automatic collection needs the Android app. The later
 * Android shell (Capacitor plugin over Health Connect) registers its implementation with
 * `registerHealthBridge`.
 */
export type HealthBridge = {
  /** Health Connect is installed and usable on this device. */
  isAvailable(): boolean;
  /** Shows the system permission prompt for these categories; resolves to the granted subset. */
  requestPermission(categories: AutoMetric[]): Promise<AutoMetric[]>;
  /**
   * Daily totals/durations (local dates, YYYY-MM-DD) of the last `days` days, for the
   * given categories only. Steps: daily total; workout/mindful: minutes; sleep: hours.
   */
  readMetrics(
    days: number,
    categories: AutoMetric[],
  ): Promise<{ date: string; metrics: Partial<Record<AutoMetric, number>> }[]>;
};

let registered: HealthBridge | null = null;

/** Installs (or removes, with null) the native implementation. Also used by tests. */
export function registerHealthBridge(bridge: HealthBridge | null): void {
  registered = bridge;
}

/** The native bridge, or null when there is none (browser, PWA, server). */
export function getHealthBridge(): HealthBridge | null {
  return registered;
}
