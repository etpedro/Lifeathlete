import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { TodayView } from "@/components/today/TodayView";
import {
  DEFAULT_HEADER_STATS,
  DEFAULT_TIMEZONE,
  getHeaderStats,
  getProfileTimezone,
  getToday,
  type HeaderStats,
} from "@/lib/data/today";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/today/dates";

/**
 * Today (spec §5). Server side: the verified user, their timezone and "today" in it,
 * then that day's habits and the header stats. Reading cookies (createClient) makes
 * the page dynamic, so `next build` never touches Supabase.
 */
export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/${locale}/login`); // the (app) layout already guards; defensive

  const timezone = await getProfileTimezone(db, user.id).catch(() => DEFAULT_TIMEZONE);
  const today = todayIn(timezone);
  // A failed day load is thrown on purpose: Next answers with a non-200 error page
  // (./error.tsx, localized, with a retry), which the service worker never stores, so a
  // failed render can never replace a good offline copy of Hoje. Stats are not critical.
  const [data, stats] = await Promise.all([
    getToday(db, today),
    getHeaderStats(db).catch((): HeaderStats => DEFAULT_HEADER_STATS),
  ]);

  return <TodayView userId={user.id} timezone={timezone} today={today} initialData={data} initialStats={stats} />;
}
