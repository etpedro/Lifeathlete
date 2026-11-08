"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { ManageableHabit } from "@/lib/data/habits";
import { AUTO_METRICS, isAutoMetric, type AutoMetric } from "@/lib/health/metrics";
import { parseTargetInput, type ProfileErrorKey } from "@/lib/profile/habit-form";
import type { MutationResult } from "./useHabitManager";
import styles from "./profile.module.css";

type Props = {
  habit: ManageableHabit;
  busy: boolean;
  onSetActive: (id: string, active: boolean) => Promise<MutationResult>;
  onSaveTarget: (id: string, target: number) => Promise<MutationResult>;
  onArchive: (id: string) => Promise<MutationResult>;
  onSetAutoSource: (id: string, metric: AutoMetric | null) => Promise<MutationResult>;
};

/**
 * One habit: pause switch, target editor and automatic-fill metric (value habits) and
 * archive with a confirmation step.
 */
export function HabitItem({ habit, busy, onSetActive, onSaveTarget, onArchive, onSetAutoSource }: Props) {
  const t = useTranslations("profile");
  const errorId = useId();
  const titleId = useId();
  const autoId = useId();
  const autoHintId = useId();
  const tMetrics = useTranslations("profile.metrics");
  const [targetText, setTargetText] = useState(String(habit.target));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ProfileErrorKey | null>(null);

  const settle = async (result: Promise<MutationResult>) => {
    const failure = await result;
    setError(failure);
    if (failure) setConfirming(false);
  };

  const saveTarget = () => {
    const target = parseTargetInput(targetText);
    if (!(target > 0)) return setError("errors.invalidTarget");
    void settle(onSaveTarget(habit.id, target));
  };

  return (
    <li className={`${styles.habit} ${habit.active ? "" : styles.paused}`}>
      <div className={styles.row}>
        <strong id={titleId} className={styles.grow}>
          {habit.title}
        </strong>
        <span className={styles.badge}>
          {habit.fromTemplate ? t("habits.fromTemplate") : t("habits.custom")} ·{" "}
          {habit.kind === "check" ? t("habits.kindCheck") : t("habits.kindValue")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={habit.active}
          aria-label={t("habits.toggleLabel", { title: habit.title })}
          className={styles.switch}
          disabled={busy}
          onClick={() => void settle(onSetActive(habit.id, !habit.active))}
        >
          {habit.active ? t("habits.active") : t("habits.paused")}
        </button>
      </div>

      {habit.kind === "value" && (
        <div className={styles.row}>
          <input
            type="text"
            inputMode="decimal"
            className={styles.input}
            aria-label={t("habits.targetLabel", { title: habit.title })}
            aria-invalid={error === "errors.invalidTarget"}
            aria-describedby={error ? errorId : undefined}
            value={targetText}
            disabled={busy}
            onChange={(e) => setTargetText(e.target.value)}
          />
          <button type="button" className={styles.button} disabled={busy} onClick={saveTarget}>
            {t("habits.saveTarget")}
          </button>
        </div>
      )}

      {habit.kind === "value" && (
        <div className={styles.field}>
          <label id={`${autoId}-label`} htmlFor={autoId}>
            {t("habits.autoFill")}
          </label>
          <select
            id={autoId}
            className={styles.select}
            aria-labelledby={`${autoId}-label ${titleId}`}
            aria-describedby={autoHintId}
            value={habit.autoSource ?? ""}
            disabled={busy}
            onChange={(e) => void settle(onSetAutoSource(habit.id, isAutoMetric(e.target.value) ? e.target.value : null))}
          >
            <option value="">{t("habits.autoFillNone")}</option>
            {AUTO_METRICS.map((m) => (
              <option key={m} value={m}>
                {tMetrics(`${m}.name`)}
              </option>
            ))}
          </select>
          <p id={autoHintId} className={styles.hint}>
            {t("habits.autoFillHint")}
            {habit.autoSource && ` ${t("habits.autoFillUnit", { unit: tMetrics(`${habit.autoSource}.unit`) })}`}
          </p>
        </div>
      )}

      {confirming ? (
        <div role="group" aria-label={t("habits.archiveLabel", { title: habit.title })} className={styles.row}>
          <p className={styles.grow}>{t("habits.archiveConfirm", { title: habit.title })}</p>
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            disabled={busy}
            onClick={() => void settle(onArchive(habit.id))}
          >
            {t("habits.archiveYes")}
          </button>
          <button type="button" className={styles.button} onClick={() => setConfirming(false)}>
            {t("habits.archiveCancel")}
          </button>
        </div>
      ) : (
        <div className={styles.row}>
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            aria-label={t("habits.archiveLabel", { title: habit.title })}
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {t("habits.archive")}
          </button>
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {t(error)}
        </p>
      )}
    </li>
  );
}
