import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";
import { valueStep } from "@/lib/today/progress";
import styles from "./today.module.css";

type Props = {
  title: string;
  value: number;
  target: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
};

const parse = (raw: string) => {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Quick value entry for a `value` habit: -/+ steps, direct input, "goal" shortcut, confirm. */
export function ValuePicker({ title, value, target, onConfirm, onCancel }: Props) {
  const t = useTranslations("today.picker");
  const tCommon = useTranslations("common");
  const inputId = useId();
  const [raw, setRaw] = useState(String(value));
  const step = valueStep(target);
  const current = parse(raw);
  const bump = (delta: number) => setRaw(String(Math.max(0, (current ?? 0) + delta)));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className={styles.picker} role="group" aria-label={t("label", { title })} onKeyDown={onKeyDown}>
      <button type="button" className={styles.target} aria-label={t("decrease")} onClick={() => bump(-step)}>
        <span aria-hidden="true">−</span>
      </button>
      <label htmlFor={inputId} className={styles.meta}>
        {t("label", { title })}
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && current !== null) onConfirm(current);
        }}
        autoFocus
      />
      <button type="button" className={styles.target} aria-label={t("increase")} onClick={() => bump(step)}>
        <span aria-hidden="true">+</span>
      </button>
      {target > 0 && (
        <button type="button" className={styles.target} onClick={() => setRaw(String(target))}>
          {t("fill")}
        </button>
      )}
      <button
        type="button"
        className={`${styles.target} ${styles.primaryTarget}`}
        disabled={current === null}
        onClick={() => current !== null && onConfirm(current)}
      >
        {t("confirm")}
      </button>
      <button type="button" className={styles.target} onClick={onCancel}>
        {tCommon("cancel")}
      </button>
    </div>
  );
}
