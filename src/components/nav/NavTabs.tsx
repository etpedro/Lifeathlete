import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import styles from "./nav.module.css";

const TABS = [
  { key: "today", href: "/today" },
  { key: "wheel", href: "/wheel" },
  { key: "achievements", href: "/achievements" },
  { key: "profile", href: "/profile" },
] as const;

/** `pathname` (locale prefix already removed) is on `href` or below it; whole segments only. */
export function isActiveTab(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The four bottom tabs (spec §5). Presentational: the active path is passed in. */
export function NavTabs({ pathname }: { pathname: string }) {
  const t = useTranslations("common.nav");
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={styles.nav} aria-label={t("label")}>
        <div className={styles.tabs}>
          {TABS.map((tab) => {
            const active = isActiveTab(pathname, tab.href);
            return (
              <Link key={tab.key} href={tab.href} className={styles.tab} aria-current={active ? "page" : undefined}>
                {t(tab.key)}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
