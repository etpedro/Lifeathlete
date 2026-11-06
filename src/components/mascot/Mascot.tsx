import type { MascotVariant } from "@/lib/data/stats";
import styles from "./mascot.module.css";
export type MascotProps = {
  /** 1-5; anything else is clamped. */
  stage: number;
  variant: MascotVariant;
  /** Perched pose, wings folded, no animation. */
  resting?: boolean;
  /** Text equivalent of the (decorative) drawing, shown next to it. */
  description: string;
};

/** Non-color cue of the variant: more sparkles = more balanced. */
const SPARKLES: Record<MascotVariant, [number, number][]> = {
  dim: [],
  normal: [
    [20, 24],
    [100, 30],
  ],
  bright: [
    [20, 24],
    [100, 30],
    [14, 70],
    [106, 74],
  ],
};

function clampStage(stage: number): number {
  return Number.isFinite(stage) ? Math.min(5, Math.max(1, Math.round(stage))) : 1;
}

function Sparkle({ x, y }: { x: number; y: number }) {
  return <path data-sparkle="" d={`M${x} ${y - 5}L${x + 1.6} ${y - 1.6}L${x + 5} ${y}L${x + 1.6} ${y + 1.6}L${x} ${y + 5}L${x - 1.6} ${y + 1.6}L${x - 5} ${y}L${x - 1.6} ${y - 1.6}Z`} className={styles.gold} />;
}

function Flying({ stage }: { stage: number }) {
  const scale = 0.78 + stage * 0.06; // wings grow with the stage
  const pairs = stage >= 2 ? 2 : 1;
  const stripes = Math.max(0, stage - 2);
  return (
    <>
      {stage === 5 && <circle className={styles.halo} cx="60" cy="34" r="17" fill="none" strokeWidth="2" strokeDasharray="3 3" />}
      <g className={`${styles.wing} ${styles.flutter}`}>
        <ellipse className={styles.wingA} cx={60 - 24 * scale} cy="46" rx={26 * scale} ry="10" opacity="0.7" transform={`rotate(-18 ${60 - 24 * scale} 46)`} />
        <ellipse className={styles.wingA} cx={60 + 24 * scale} cy="46" rx={26 * scale} ry="10" opacity="0.7" transform={`rotate(18 ${60 + 24 * scale} 46)`} />
      </g>
      {pairs === 2 && (
        <g className={`${styles.wing} ${styles.flutter}`}>
          <ellipse className={styles.wingB} cx={60 - 22 * scale} cy="62" rx={22 * scale} ry="8" opacity="0.6" transform={`rotate(14 ${60 - 22 * scale} 62)`} />
          <ellipse className={styles.wingB} cx={60 + 22 * scale} cy="62" rx={22 * scale} ry="8" opacity="0.6" transform={`rotate(-14 ${60 + 22 * scale} 62)`} />
        </g>
      )}
      {stage >= 4 && (
        <path className={styles.bodyLine} d="M54 28Q50 20 45 18M66 28Q70 20 75 18" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      )}
      <rect className={styles.body} x="56" y="40" width="8" height={50 + stage * 4} rx="4" />
      {Array.from({ length: stripes }, (_, i) => (
        <line key={i} className={styles.eyeLine} x1="56" x2="64" y1={56 + i * 10} y2={56 + i * 10} strokeWidth="1.5" opacity="0.7" />
      ))}
      <circle className={styles.body} cx="60" cy="34" r="9" />
      <circle className={styles.eye} cx="56.5" cy="32.5" r="1.6" />
      <circle className={styles.eye} cx="63.5" cy="32.5" r="1.6" />
    </>
  );
}

function Perched({ stage }: { stage: number }) {
  const length = 40 + stage * 4;
  return (
    <>
      <line className={styles.perch} x1="14" y1="86" x2="106" y2="86" strokeWidth="4" strokeLinecap="round" />
      {/* wings folded back along the body */}
      <ellipse className={styles.wingA} cx={60 - length / 2 + 10} cy="73" rx={length / 2} ry="3.5" opacity="0.75" transform="rotate(4 60 73)" />
      {stage >= 2 && <ellipse className={styles.wingB} cx={60 - length / 2 + 8} cy="76" rx={length / 2 - 4} ry="3" opacity="0.65" transform="rotate(4 60 76)" />}
      <rect className={styles.body} x={60 - length / 2 + 6} y="78" width={length} height="7" rx="3.5" />
      <circle className={styles.body} cx={60 + length / 2 + 6} cy="80" r="7" />
      {/* closed, content eyes */}
      <path d={`M${60 + length / 2 + 3} 79Q${60 + length / 2 + 5} 81 ${60 + length / 2 + 7} 79`} className={styles.eyeLine} strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </>
  );
}

/** Parametric dragonfly mascot. Decorative: the caption carries the meaning. */
export function Mascot({ stage, variant, resting = false, description }: MascotProps) {
  const s = clampStage(stage);
  return (
    <figure className={styles.figure}>
      <svg
        className={`${styles.svg} ${styles[variant]}`}
        viewBox="0 0 120 120"
        aria-hidden="true"
        focusable="false"
        data-stage={s}
        data-variant={variant}
        data-resting={resting ? "true" : "false"}
      >
        {resting ? <Perched stage={s} /> : <Flying stage={s} />}
        {!resting && SPARKLES[variant].map(([x, y]) => <Sparkle key={`${x}-${y}`} x={x} y={y} />)}
      </svg>
      <figcaption>{description}</figcaption>
    </figure>
  );
}
