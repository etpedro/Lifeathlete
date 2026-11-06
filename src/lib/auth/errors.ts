/** Message keys under `common.errors` for auth failures. */
export type AuthErrorKey =
  | "invalidCredentials"
  | "userExists"
  | "weakPassword"
  | "emailNotConfirmed"
  | "rateLimited"
  | "invalidEmail"
  | "generic";

const BY_CODE: Record<string, AuthErrorKey> = {
  invalid_credentials: "invalidCredentials",
  user_already_exists: "userExists",
  email_exists: "userExists",
  weak_password: "weakPassword",
  email_not_confirmed: "emailNotConfirmed",
  over_request_rate_limit: "rateLimited",
  over_email_send_rate_limit: "rateLimited",
  validation_failed: "invalidEmail",
  email_address_invalid: "invalidEmail",
};

/** Maps a Supabase Auth error to a friendly message key; never exposes the raw error. */
export function authErrorKey(error: unknown): AuthErrorKey {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return BY_CODE[error.code] ?? "generic";
  }
  return "generic";
}
