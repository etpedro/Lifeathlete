import { describe, expect, it, vi } from "vitest";
import { callbackRedirect } from "./access";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  RESET_NEXT,
  requestResetOutcome,
  resetRedirectUrl,
  runPasswordUpdate,
  runResetRequest,
  updatePasswordErrorKey,
  validateNewPassword,
} from "./password-reset";

const authError = (code: string, name = "AuthApiError") => Object.assign(new Error("raw backend text"), { code, name });

describe("reset link routing", () => {
  it("the email link returns to the locale's existing auth callback, flagged as a recovery", () => {
    expect(resetRedirectUrl("https://app.example", "en")).toBe("https://app.example/en/auth/callback?next=reset-password");
    expect(RESET_NEXT).toBe("reset-password");
  });

  it("the callback sends a recovery session to the set-new-password page, a failed one to request a new link", () => {
    expect(callbackRedirect("pt", true, RESET_NEXT)).toBe("/pt/auth/reset-password");
    expect(callbackRedirect("en", false, RESET_NEXT)).toBe("/en/auth/forgot-password?error=expired");
    expect(callbackRedirect("en", true, "https://evil.example")).toBe("/en/today"); // unknown next ignored
    expect(callbackRedirect("en", true, null)).toBe("/en/today");
  });
});

describe("validateNewPassword", () => {
  it(`requires ${PASSWORD_MIN}..${PASSWORD_MAX} characters and a matching confirmation`, () => {
    expect(validateNewPassword("a".repeat(PASSWORD_MIN - 1), "a".repeat(PASSWORD_MIN - 1))).toBe("tooShort");
    expect(validateNewPassword("a".repeat(PASSWORD_MAX + 1), "a".repeat(PASSWORD_MAX + 1))).toBe("tooLong");
    expect(validateNewPassword("correct-horse", "correct-horsf")).toBe("mismatch");
    expect(validateNewPassword("correct-horse", "correct-horse")).toBeNull();
  });
});

describe("requestResetOutcome (never reveals whether an email has an account)", () => {
  it("success, unknown users and other backend errors all read as 'sent'", () => {
    expect(requestResetOutcome(null)).toBe("sent");
    expect(requestResetOutcome(authError("user_not_found"))).toBe("sent");
    expect(requestResetOutcome(authError("unexpected_failure"))).toBe("sent");
  });
  it("rate limits, a malformed email and network failures are shown (they reveal nothing)", () => {
    expect(requestResetOutcome(authError("over_email_send_rate_limit"))).toBe("rateLimited");
    expect(requestResetOutcome(authError("email_address_invalid"))).toBe("invalidEmail");
    expect(requestResetOutcome(authError("", "AuthRetryableFetchError"))).toBe("network");
    expect(requestResetOutcome(new TypeError("Failed to fetch"))).toBe("network");
  });
});

describe("updatePasswordErrorKey", () => {
  it("maps Supabase codes to message keys, never raw text", () => {
    expect(updatePasswordErrorKey(authError("same_password"))).toBe("same");
    expect(updatePasswordErrorKey(authError("weak_password"))).toBe("weak");
    expect(updatePasswordErrorKey(authError("session_not_found"))).toBe("expired");
    expect(updatePasswordErrorKey(authError("", "AuthSessionMissingError"))).toBe("expired");
    expect(updatePasswordErrorKey(authError("over_request_rate_limit"))).toBe("rateLimited");
    expect(updatePasswordErrorKey(authError("something_else"))).toBe("generic");
    expect(updatePasswordErrorKey("nope")).toBe("generic");
  });
});

describe("runResetRequest", () => {
  it("trims the email and asks for a link that returns to the callback", async () => {
    const send = vi.fn(async () => ({ error: null }));
    expect(await runResetRequest("  a@b.c ", "https://o", "pt", send)).toBe("sent");
    expect(send).toHaveBeenCalledWith("a@b.c", { redirectTo: "https://o/pt/auth/callback?next=reset-password" });
  });
  it("an empty email is invalid without a request; a thrown error is handled", async () => {
    const send = vi.fn(async () => ({ error: null }));
    expect(await runResetRequest("  ", "https://o", "pt", send)).toBe("invalidEmail");
    expect(send).not.toHaveBeenCalled();
    expect(await runResetRequest("a@b.c", "https://o", "pt", () => Promise.reject(new TypeError("x")))).toBe("network");
  });
});

describe("runPasswordUpdate", () => {
  it("validates before calling updateUser, then reports success", async () => {
    const update = vi.fn(async () => ({ error: null }));
    expect(await runPasswordUpdate("short", "short", update)).toBe("tooShort");
    expect(update).not.toHaveBeenCalled();
    expect(await runPasswordUpdate("correct-horse", "correct-horse", update)).toBe("done");
    expect(update).toHaveBeenCalledWith({ password: "correct-horse" });
  });
  it("maps a backend failure to a key", async () => {
    const update = async () => ({ error: authError("same_password") });
    expect(await runPasswordUpdate("correct-horse", "correct-horse", update)).toBe("same");
    expect(await runPasswordUpdate("correct-horse", "correct-horse", () => Promise.reject(new Error("x")))).toBe("generic");
  });
});
