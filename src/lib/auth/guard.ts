import { hasLocale } from "next-intl";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getAccessState } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { PATHNAME_HEADER, pageRedirect, type Area, type Locale } from "./access";

/**
 * Server-side gate for an area of the app: reads the session and `profiles.onboarded_at`
 * and redirects when the user does not belong here; onboarded users are sent to their
 * stored locale (profiles.locale), keeping the page (path forwarded by the proxy).
 */
export async function guardArea(area: Area, localeParam: string): Promise<Locale> {
  if (!hasLocale(routing.locales, localeParam)) notFound();
  const state = await getAccessState(await createClient());
  const pathname = (await headers()).get(PATHNAME_HEADER);
  const target = pageRedirect(area, localeParam, state, pathname);
  if (target) redirect(target);
  return localeParam;
}
