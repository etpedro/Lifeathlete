import { polygonPoints, radarPoint, type Circle } from "@/components/wheel/geometry";
import styles from "./how.module.css";

export type StepKind = "checkin" | "progress" | "balance";

const MINI: Circle = { cx: 60, cy: 46, radius: 32 };
const MINI_SCORES = [86, 70, 78, 90, 64, 74, 30, 80, 84, 72];

/** Small decorative drawings for the three steps (aria-hidden; the text carries the meaning). */
export function StepArt({ kind }: { kind: StepKind }) {
  return (
    <svg className={styles.art} viewBox="0 0 120 92" aria-hidden="true" focusable="false">
      {kind === "checkin" && (
        <>
          <rect className={styles.panel} x="8" y="26" width="104" height="40" rx="12" />
          <rect className={styles.line} x="22" y="38" width="44" height="6" rx="3" />
          <rect className={styles.lineSoft} x="22" y="50" width="28" height="5" rx="2.5" />
          <circle className={styles.ripple} cx="90" cy="46" r="21" />
          <circle className={styles.rippleFaint} cx="90" cy="46" r="29" />
          <circle className={styles.check} cx="90" cy="46" r="12" />
          <path className={styles.tick} d="M84.5 46.5l3.8 3.7 7.2-7.6" />
        </>
      )}
      {kind === "progress" && (
        <>
          <path className={styles.medal} d="M44 14l6 12M60 14l-6 12" />
          <circle className={styles.medalFace} cx="52" cy="36" r="13" />
          <path className={styles.star} d="M52 29.5l2 4.2 4.6.6-3.4 3.2.9 4.6-4.1-2.3-4.1 2.3.9-4.6-3.4-3.2 4.6-.6z" />
          <path className={styles.flame} d="M86 50c-6 0-9.5-4.3-8.6-9.2.7-3.8 3.9-5.4 4.4-9.8 3.4 2.4 3.6 5.6 3.2 7.4 1.5-.8 2.3-2.3 2.4-3.9 3.4 2.8 4.9 6.3 4.3 9.3-.6 3.5-2.8 6.2-5.7 6.2z" />
          <rect className={styles.track} x="16" y="64" width="88" height="8" rx="4" />
          <rect className={styles.fill} x="16" y="64" width="60" height="8" rx="4" />
        </>
      )}
      {kind === "balance" && (
        <>
          {[50, 100].map((r) => (
            <polygon key={r} className={styles.miniRing} points={polygonPoints(Array.from({ length: 10 }, () => r), MINI)} />
          ))}
          <polygon className={styles.miniArea} points={polygonPoints(MINI_SCORES, MINI)} />
          {(() => {
            const p = radarPoint(6, 10, MINI_SCORES[6], MINI);
            return (
              <>
                <circle className={styles.careRing} cx={p.x} cy={p.y} r="7" />
                <circle className={styles.care} cx={p.x} cy={p.y} r="3.5" />
              </>
            );
          })()}
        </>
      )}
    </svg>
  );
}
