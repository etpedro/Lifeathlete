/**
 * The native health bridge (automatic steps). Phase 1 ships no native code: in the browser
 * and the installed PWA there is no bridge, so `getHealthBridge()` is null and the UI only
 * explains that automatic steps need the Android app. Phase 2's Android shell (Capacitor
 * plugin over Health Connect) registers its implementation with `registerHealthBridge`.
 */
export type HealthBridge = {
  /** Health Connect is installed and usable on this device. */
  isAvailable(): boolean;
  /** Shows the system permission prompt for reading steps; true when granted. */
  requestPermission(): Promise<boolean>;
  /** Daily step totals (local dates, YYYY-MM-DD) of the last `days` days. */
  readSteps(days: number): Promise<{ date: string; steps: number }[]>;
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
