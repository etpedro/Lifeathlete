import { useId, type ReactNode } from "react";
import styles from "./ui.module.css";

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** done/total clamped to [0, 1]; 0 when there is nothing to do (or the input is not finite). */
function fractionOf(done: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(done)) return 0;
  return Math.min(1, Math.max(0, done / total));
}

/** A progress ring (SVG) with a success-to-focus gradient stroke; children sit in its center. */
export function ProgressRing({
  done,
  total,
  label,
  size = 120,
  children,
}: {
  done: number;
  total: number;
  label: string;
  size?: number;
  children?: ReactNode;
}) {
  const gradientId = useId();
  const fraction = fractionOf(done, total);
  return (
    <div className={styles.ring} style={{ width: size, height: size }}>
      <svg
        role="img"
        aria-label={label}
        data-fraction={String(fraction)}
        viewBox="0 0 100 100"
        width={size}
        height={size}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-success)" }} />
            <stop offset="1" style={{ stopColor: "var(--color-focus)" }} />
          </linearGradient>
        </defs>
        <circle className={styles.ringTrack} cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="8" />
        <circle
          className={styles.ringFill}
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      {children ? <div className={styles.ringCenter}>{children}</div> : null}
    </div>
  );
}
