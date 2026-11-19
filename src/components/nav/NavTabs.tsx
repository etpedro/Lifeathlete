import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import styles from "./nav.module.css";

const ICONS = {
  today: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" fill="currentColor" />,
  wheel: (
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  achievements: <path d="M7 4h10v4a5 5 0 0 1-10 0zM10 15h4v3h3v2H7v-2h3z" fill="currentColor" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6z" fill="currentColor" />
    </>
  ),
};

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
                <span className={styles.icon}>
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    {ICONS[tab.key]}
                  </svg>
                </span>
                <span className={styles.label}>{t(tab.key)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
