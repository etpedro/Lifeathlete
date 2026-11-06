import { useTranslations } from "next-intl";
import { backfillDates } from "@/lib/today/dates";
import styles from "./today.module.css";

const LABELS = ["today", "yesterday", "twoDaysAgo"] as const;

type Props = { today: string; selected: string; onSelect: (daysAgo: number) => void };

/**
 * Today, yesterday and 2 days ago: the only days that can be filled in. Emits days-ago,
 * so the controller resolves it against the real current day (midnight may have passed).
 */
export function DayStrip({ today, selected, onSelect }: Props) {
  const t = useTranslations("today.days");
  return (
    <nav aria-label={t("label")} className={styles.days}>
      {backfillDates(today).map(({ date, daysAgo }) => (
        <button
          key={date}
          type="button"
          className={styles.target}
          aria-pressed={date === selected}
          onClick={() => onSelect(daysAgo)}
        >
          <time dateTime={date}>{t(LABELS[daysAgo] ?? "today")}</time>
        </button>
      ))}
    </nav>
  );
}
