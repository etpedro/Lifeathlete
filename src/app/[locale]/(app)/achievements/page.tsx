import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AchievementsView } from "@/components/achievements/AchievementsView";
import { isResting } from "@/components/mascot/resting";
import { getAchievements, getProfileStats } from "@/lib/data/stats";
import { DEFAULT_TIMEZONE, getProfileTimezone } from "@/lib/data/today";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/today/dates";

/**
 * Achievements (spec §5). Reading cookies (createClient) makes the page dynamic, so
 * `next build` never touches Supabase. "Today" is computed in the profile timezone to
 * decide whether the dragonfly rests.
 */
export default async function AchievementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/${locale}/login`); // the (app) layout already guards; defensive

  const timeZone = await getProfileTimezone(db, user.id).catch(() => DEFAULT_TIMEZONE);
  const [stats, medals] = await Promise.all([
    getProfileStats(db).catch(() => null),
    getAchievements(db, locale === "en" ? "en" : "pt").catch(() => null),
  ]);
  const resting = stats ? isResting(stats.lastActiveDate, todayIn(timeZone)) : false;
  return <AchievementsView stats={stats} medals={medals} resting={resting} timeZone={timeZone} />;
}
