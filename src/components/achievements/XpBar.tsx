import styles from "./achievements.module.css";

export type XpBarProps = {
  /** Accessible name. */
  label: string;
  /** Human text of the value, e.g. "40 / 100 XP". */
  valueText: string;
  value: number;
  max: number;
};

/** Accessible progress bar (XP into the level; also used for medal progress). */
export function XpBar({ label, valueText, value, max }: XpBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Number.isFinite(value) ? Math.min(safeMax, Math.max(0, value)) : 0;
  const percent = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      aria-valuetext={valueText}
      className={styles.track}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}
