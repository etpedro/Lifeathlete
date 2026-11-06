import { useTranslations } from "next-intl";
import { backfillDates } from "@/lib/today/dates";
import styles from "./today.module.css";

const LABELS = ["today", "yesterday", "twoDaysAgo"] as const;

type Props = { today: string; selected: string; onSelect: (date: string) => void };

/** Today, yesterday and 2 days ago: the only days that can be filled in. */
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
          onClick={() => onSelect(date)}
        >
          <time dateTime={date}>{t(LABELS[daysAgo] ?? "today")}</time>
        </button>
      ))}
    </nav>
  );
}
