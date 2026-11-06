import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import styles from "@/components/profile/profile.module.css";

/** Profile (spec §5): a minimal hub for now; other sections are added to the link list. */
export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
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
      </ul>
    </main>
  );
}
