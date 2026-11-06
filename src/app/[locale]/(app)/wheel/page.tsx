import { setRequestLocale } from "next-intl/server";
import { WheelView } from "@/components/wheel/WheelView";
import { getProfileStats, getWheel } from "@/lib/data/stats";
import { getShareProps } from "@/lib/data/shareProps";
import { createClient } from "@/lib/supabase/server";

/**
 * Wheel of Life (spec §5). Reading cookies (createClient) makes the page dynamic, so
 * `next build` never touches Supabase. A failed load shows a message, not an error screen.
 */
export default async function WheelPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const db = await createClient();
  const [wheel, stats] = await Promise.all([getWheel(db).catch(() => null), getProfileStats(db).catch(() => null)]);
  const share =
    wheel && stats
      ? await getShareProps(locale, { level: stats.level, streak: stats.currentStreak, scores: wheel.scores })
      : null;
  return <WheelView wheel={wheel} share={share} />;
}
