/** Absolute URL of the locale-aware auth callback route, for OAuth and email links. */
export function authCallbackUrl(locale: string): string {
  return `${window.location.origin}/${locale}/auth/callback`;
}
