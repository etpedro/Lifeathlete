export type SignOutStatus = "idle" | "working" | "error";

export type SignOutDeps = {
  signOut: () => Promise<{ error: unknown }>;
  /** Removes this user's stored pages from the service worker caches. Must not throw. */
  clearCaches: () => Promise<void>;
  navigate: () => void;
};

/**
 * Sign-out flow: sign out, then clear the user's cached pages (always, even when sign-out
 * failed: it is harmless and protects a shared device), then leave for the login page only
 * when sign-out succeeded. Never reports success for a failed sign-out.
 */
export async function runSignOut(deps: SignOutDeps): Promise<"done" | "error"> {
  const ok = await deps.signOut().then(
    (result) => !result.error,
    () => false,
  );
  await deps.clearCaches();
  if (!ok) return "error";
  deps.navigate();
  return "done";
}
