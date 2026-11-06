import { setRequestLocale } from "next-intl/server";
import { WheelView } from "@/components/wheel/WheelView";
import { getWheel } from "@/lib/data/stats";
import { createClient } from "@/lib/supabase/server";

/**
 * Wheel of Life (spec §5). Reading cookies (createClient) makes the page dynamic, so
 * `next build` never touches Supabase. A failed load shows a message, not an error screen.
 */
export default async function WheelPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const db = await createClient();
  const wheel = await getWheel(db).catch(() => null);
  return <WheelView wheel={wheel} />;
}
