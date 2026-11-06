import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { HabitManager } from "@/components/profile/HabitManager";
import { listManageableHabits, listPillars, type ManageablePillar, type PillarOption } from "@/lib/data/habits";
import { createClient } from "@/lib/supabase/server";

/**
 * Habit management (spec §5 Perfil). Server side: the verified user and the first load of
 * habits and pillars; reading cookies (createClient) makes the page dynamic, so
 * `next build` never touches Supabase. A failed load is retried by the client component.
 */
export default async function HabitsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/${locale}/login`); // the (app) layout already guards; defensive

  const [initial, pillarOptions] = await Promise.all([
    listManageableHabits(db).catch((): ManageablePillar[] | null => null),
    listPillars(db).catch((): PillarOption[] => []),
  ]);
  return <HabitManager userId={user.id} initial={initial} pillarOptions={pillarOptions} />;
}
