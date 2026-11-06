import { hasLocale } from "next-intl";
import { notFound, redirect } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getAccessState } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { pageRedirect, type Area, type Locale } from "./access";

/**
 * Server-side gate for an area of the app: reads the session and `profiles.onboarded_at`
 * and redirects (locale preserved) when the user does not belong here.
 */
export async function guardArea(area: Area, localeParam: string): Promise<Locale> {
  if (!hasLocale(routing.locales, localeParam)) notFound();
  const state = await getAccessState(await createClient());
  const target = pageRedirect(area, localeParam, state);
  if (target) redirect(target);
  return localeParam;
}
