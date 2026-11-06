import { describe, expect, it } from "vitest";
import { authErrorKey } from "./errors";

describe("authErrorKey", () => {
  it.each([
    [{ code: "invalid_credentials", message: "Invalid login credentials" }, "invalidCredentials"],
    [{ code: "user_already_exists", message: "User already registered" }, "userExists"],
    [{ code: "email_exists", message: "x" }, "userExists"],
    [{ code: "weak_password", message: "x" }, "weakPassword"],
    [{ code: "email_not_confirmed", message: "x" }, "emailNotConfirmed"],
    [{ code: "over_request_rate_limit", message: "x" }, "rateLimited"],
    [{ code: "over_email_send_rate_limit", message: "x" }, "rateLimited"],
    [{ code: "validation_failed", message: "x" }, "invalidEmail"],
    [{ code: "email_address_invalid", message: "x" }, "invalidEmail"],
    [{ code: "something_new", message: "boom" }, "generic"],
    [{ message: "Failed to fetch" }, "generic"],
    [null, "generic"],
    [new Error("network"), "generic"],
  ])("%j -> %s", (error, key) => {
    expect(authErrorKey(error)).toBe(key);
  });
});
