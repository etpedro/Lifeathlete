import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "@/components/profile/LanguageSwitch";
import { SignOutButton } from "@/components/profile/SignOutButton";
import styles from "@/components/profile/profile.module.css";
import { createClient } from "@/lib/supabase/server";

/**
 * Profile (spec §5): habit management and integrations links, language and sign-out. Server side: the
 * verified user; reading cookies (createClient) keeps the page dynamic.
 */
export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/${locale}/login`); // the (app) layout already guards; defensive
  const t = await getTranslations("profile");
  return (
    <main className={styles.screen}>
      <h1>{t("title")}</h1>
      <ul className={styles.linkList}>
        <li>
          <Link href="/profile/habits" className={styles.link}>
            {t("links.habits")}
          </Link>
        </li>
        <li>
          <Link href="/profile/integrations" className={styles.link}>
            {t("links.integrations")}
          </Link>
        </li>
      </ul>
      <LanguageSwitch userId={user.id} />
      <SignOutButton locale={locale} />
    </main>
  );
}
