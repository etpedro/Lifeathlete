import { MANUAL_SOURCE, NO_LOG_SOURCE } from "@/lib/data/today";

/** Providers with a name in the `today.providers` messages. */
export const KNOWN_PROVIDERS = ["strava", "google_fit", "apple_health", "garmin", "fitbit"] as const;
export type ProviderKey = (typeof KNOWN_PROVIDERS)[number] | "other";

/** Message key of the provider that filled a log ("via Strava"), or null for manual / no log. */
export function providerOf(source: string): ProviderKey | null {
  if (source === MANUAL_SOURCE || source === NO_LOG_SOURCE) return null;
  return (KNOWN_PROVIDERS as readonly string[]).includes(source) ? (source as ProviderKey) : "other";
}
