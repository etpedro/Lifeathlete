import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { TodayHabit } from "@/lib/data/today";
import { isComplete, progressPercent } from "@/lib/today/progress";
import { providerOf } from "@/lib/today/source";
import styles from "./today.module.css";
import { ValuePicker } from "./ValuePicker";

type Props = {
  habit: TodayHabit;
  pending: boolean;
  onSetValue: (habit: TodayHabit, value: number) => void;
};

/**
 * One habit. A `check` habit toggles with one tap (aria-pressed); a `value` habit opens
 * the quick picker and shows progress against its target. Provider-filled logs show
 * their origin and stay correctable; unsynced offline values show a pending marker.
 */
export function HabitRow({ habit, pending, onSetValue }: Props) {
  const t = useTranslations("today.habit");
  const tProviders = useTranslations("today.providers");
  const [picking, setPicking] = useState(false);
  const metaId = useId();
  const done = isComplete(habit);
  const provider = providerOf(habit.source);
  const percent = progressPercent(habit);

  const meta = (
    <span id={metaId} className={styles.meta}>
      {habit.kind === "value" && done && <span>{t("done")}</span>}
      {provider && <span>{t("via", { provider: tProviders(provider) })}</span>}
      {pending && <span className={styles.pending}>{t("pending")}</span>}
    </span>
  );

  if (habit.kind === "check") {
    return (
      <li className={styles.habit}>
        <button
          type="button"
          className={styles.habitButton}
          aria-pressed={done}
          aria-describedby={provider || pending ? metaId : undefined}
          onClick={() => onSetValue(habit, done ? 0 : 1)}
        >
          <span>{habit.title}</span>
          <span aria-hidden="true" className={styles.state}>
            {done ? t("done") : t("notDone")}
          </span>
        </button>
        {meta}
      </li>
    );
  }

  const progressText =
    habit.target > 0 ? t("progress", { value: habit.value, target: habit.target }) : t("progressNoTarget", { value: habit.value });

  return (
    <li className={styles.habit}>
      <button
        type="button"
        className={`${styles.habitButton} ${done ? styles.habitDone : ""}`}
        aria-label={t("edit", { title: habit.title })}
        aria-expanded={picking}
        aria-describedby={metaId}
        onClick={() => setPicking((open) => !open)}
      >
        <span>{habit.title}</span>
        <span className={styles.value}>{progressText}</span>
      </button>
      <progress className={styles.bar} max={100} value={percent} aria-label={progressText} />
      {meta}
      {picking && (
        <ValuePicker
          title={habit.title}
          value={habit.value}
          target={habit.target}
          onCancel={() => setPicking(false)}
          onConfirm={(value) => {
            setPicking(false);
            onSetValue(habit, value);
          }}
        />
      )}
    </li>
  );
}
