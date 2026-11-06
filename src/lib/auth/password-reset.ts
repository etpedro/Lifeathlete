// Password reset (ruling N: email + password accounts). Pure rules shared by the request
// form, the auth callback and the set-new-password form; no framework imports.

/** `next` value of the reset link's callback URL: the session it creates is a recovery session. */
export const RESET_NEXT = "reset-password";
/** Supabase's default minimum (also the sign-up form's) and bcrypt's 72-byte input limit. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** Where the reset email sends the user: the existing locale-aware callback, flagged as a recovery. */
export function resetRedirectUrl(origin: string, locale: string): string {
  return `${origin}/${locale}/auth/callback?next=${RESET_NEXT}`;
}

export type PasswordValidationKey = "tooShort" | "tooLong" | "mismatch";

export function validateNewPassword(password: string, confirm: string): PasswordValidationKey | null {
  if (password.length < PASSWORD_MIN) return "tooShort";
  if (password.length > PASSWORD_MAX) return "tooLong";
  if (password !== confirm) return "mismatch";
  return null;
}

const codeOf = (e: unknown) =>
  e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : "";
const nameOf = (e: unknown) =>
  e && typeof e === "object" && "name" in e && typeof e.name === "string" ? e.name : "";

const isNetwork = (e: unknown) => e instanceof TypeError || nameOf(e) === "AuthRetryableFetchError";

export type ResetRequestOutcome = "sent" | "rateLimited" | "invalidEmail" | "network";

/**
 * The request form's outcome. Anything that could depend on whether the email has an
 * account reads as "sent" (the message says "if an account exists"); only rate limits, a
 * malformed address and network failures are shown, as they reveal nothing.
 */
export function requestResetOutcome(error: unknown): ResetRequestOutcome {
  if (!error) return "sent";
  const code = codeOf(error);
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "rateLimited";
  if (code === "email_address_invalid" || code === "validation_failed") return "invalidEmail";
  if (isNetwork(error)) return "network";
  return "sent";
}

export type UpdatePasswordErrorKey = "same" | "weak" | "expired" | "rateLimited" | "generic";

/** Message key for a failed updateUser({ password }); never the raw backend text. */
export function updatePasswordErrorKey(error: unknown): UpdatePasswordErrorKey {
  const code = codeOf(error);
  if (code === "same_password") return "same";
  if (code === "weak_password") return "weak";
  if (code === "session_not_found" || code === "session_expired" || nameOf(error) === "AuthSessionMissingError") {
    return "expired";
  }
  if (code === "over_request_rate_limit") return "rateLimited";
  return "generic";
}

type SendReset = (email: string, options: { redirectTo: string }) => Promise<{ error: unknown }>;

/** Request flow: resetPasswordForEmail with the locale-aware callback as redirect. */
export async function runResetRequest(
  email: string,
  origin: string,
  locale: string,
  send: SendReset,
): Promise<ResetRequestOutcome> {
  const trimmed = email.trim();
  if (trimmed.length === 0) return "invalidEmail";
  try {
    const { error } = await send(trimmed, { redirectTo: resetRedirectUrl(origin, locale) });
    return requestResetOutcome(error);
  } catch (error) {
    const outcome = requestResetOutcome(error);
    return outcome === "sent" ? "network" : outcome; // a thrown error never means "sent"
  }
}

type UpdateUser = (attributes: { password: string }) => Promise<{ error: unknown }>;

/** Set-new-password flow: validate, then updateUser({ password }) on the recovery session. */
export async function runPasswordUpdate(
  password: string,
  confirm: string,
  update: UpdateUser,
): Promise<"done" | PasswordValidationKey | UpdatePasswordErrorKey> {
  const invalid = validateNewPassword(password, confirm);
  if (invalid) return invalid;
  try {
    const { error } = await update({ password });
    return error ? updatePasswordErrorKey(error) : "done";
  } catch (error) {
    return updatePasswordErrorKey(error);
  }
}
