import type { HealthFlowCode } from "./sync";

/** Keys inside the `profile.integrations` message namespace. */
export type IntegrationErrorKey =
  | "errors.consentRequired"
  | "errors.invalidRequest"
  | "errors.unauthorized"
  | "errors.unsupportedSource"
  | "errors.syncFailed"
  | "errors.network"
  | "errors.permissionDenied"
  | "errors.readFailed";

const KEYS = {
  consent_required: "errors.consentRequired",
  invalid_request: "errors.invalidRequest",
  unauthorized: "errors.unauthorized",
  unsupported_source: "errors.unsupportedSource",
  sync_failed: "errors.syncFailed",
  network: "errors.network",
  permission_denied: "errors.permissionDenied",
  read_failed: "errors.readFailed",
} as const satisfies Record<HealthFlowCode, IntegrationErrorKey>;

/** Localized-message key of a health flow error code (unknown -> the generic sync error). */
export function healthErrorKey(code: HealthFlowCode): IntegrationErrorKey {
  return (KEYS as Record<string, IntegrationErrorKey>)[code] ?? "errors.syncFailed";
}

/** `timezone` when Intl knows it, else "UTC" (an invalid profile timezone must not crash a render). */
export function safeTimeZone(timezone: string): string {
  if (!timezone) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}
