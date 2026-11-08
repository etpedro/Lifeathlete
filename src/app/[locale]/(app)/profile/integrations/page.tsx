import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { HealthIntegration } from "@/components/profile/integrations/HealthIntegration";
import styles from "@/components/profile/profile.module.css";
import { getHealthConnection, type HealthConnection } from "@/lib/data/integrations";
import { DEFAULT_TIMEZONE, getProfileTimezone } from "@/lib/data/today";
import { createClient } from "@/lib/supabase/server";

/**
 * Integrações (automatic steps, phase 1). Server side: the verified user, the connection
 * status (granted columns only) and the profile timezone; reading cookies (createClient)
 * keeps the page dynamic, so `next build` never touches Supabase. Whether this device has
 * the native health bridge is only known on the client.
 */
export default async function IntegrationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/${locale}/login`); // the (app) layout already guards; defensive

  const [initial, timezone, t] = await Promise.all([
    getHealthConnection(db).catch((): HealthConnection | null => null),
    getProfileTimezone(db, user.id).catch(() => DEFAULT_TIMEZONE),
    getTranslations("profile.integrations"),
  ]);
  return (
    <main className={styles.screen}>
      <Link href="/profile" className={styles.link}>
        {t("back")}
      </Link>
      <h1>{t("title")}</h1>
      <p className={styles.intro}>{t("intro")}</p>
      <HealthIntegration timezone={timezone} initial={initial} />
    </main>
  );
}
