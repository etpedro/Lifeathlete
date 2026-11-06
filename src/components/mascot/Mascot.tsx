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

const BODY = "#2E933C";
const WING_A = "#5BC0EB";
const WING_B = "#9B5DE5";

function clampStage(stage: number): number {
  return Number.isFinite(stage) ? Math.min(5, Math.max(1, Math.round(stage))) : 1;
}

function Sparkle({ x, y }: { x: number; y: number }) {
  return <path data-sparkle="" d={`M${x} ${y - 5}L${x + 1.6} ${y - 1.6}L${x + 5} ${y}L${x + 1.6} ${y + 1.6}L${x} ${y + 5}L${x - 1.6} ${y + 1.6}L${x - 5} ${y}L${x - 1.6} ${y - 1.6}Z`} fill="#F5B700" />;
}

function Flying({ stage }: { stage: number }) {
  const scale = 0.78 + stage * 0.06; // wings grow with the stage
  const pairs = stage >= 2 ? 2 : 1;
  const stripes = Math.max(0, stage - 2);
  return (
    <>
      {stage === 5 && <circle cx="60" cy="34" r="17" fill="none" stroke="#F5B700" strokeWidth="2" strokeDasharray="3 3" />}
      <g className={`${styles.wing} ${styles.flutter}`}>
        <ellipse cx={60 - 24 * scale} cy="46" rx={26 * scale} ry="10" fill={WING_A} opacity="0.65" transform={`rotate(-18 ${60 - 24 * scale} 46)`} />
        <ellipse cx={60 + 24 * scale} cy="46" rx={26 * scale} ry="10" fill={WING_A} opacity="0.65" transform={`rotate(18 ${60 + 24 * scale} 46)`} />
      </g>
      {pairs === 2 && (
        <g className={`${styles.wing} ${styles.flutter}`}>
          <ellipse cx={60 - 22 * scale} cy="62" rx={22 * scale} ry="8" fill={WING_B} opacity="0.55" transform={`rotate(14 ${60 - 22 * scale} 62)`} />
          <ellipse cx={60 + 22 * scale} cy="62" rx={22 * scale} ry="8" fill={WING_B} opacity="0.55" transform={`rotate(-14 ${60 + 22 * scale} 62)`} />
        </g>
      )}
      {stage >= 4 && (
        <path d="M54 28Q50 20 45 18M66 28Q70 20 75 18" stroke={BODY} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      )}
      <rect x="56" y="40" width="8" height={50 + stage * 4} rx="4" fill={BODY} />
      {Array.from({ length: stripes }, (_, i) => (
        <line key={i} x1="56" x2="64" y1={56 + i * 10} y2={56 + i * 10} stroke="#fff" strokeWidth="1.5" opacity="0.8" />
      ))}
      <circle cx="60" cy="34" r="9" fill={BODY} />
      <circle cx="56.5" cy="32.5" r="1.6" fill="#fff" />
      <circle cx="63.5" cy="32.5" r="1.6" fill="#fff" />
    </>
  );
}

function Perched({ stage }: { stage: number }) {
  const length = 40 + stage * 4;
  return (
    <>
      <line x1="14" y1="86" x2="106" y2="86" stroke="#8B6B4A" strokeWidth="4" strokeLinecap="round" />
      {/* wings folded back along the body */}
      <ellipse cx={60 - length / 2 + 10} cy="73" rx={length / 2} ry="3.5" fill={WING_A} opacity="0.7" transform="rotate(4 60 73)" />
      {stage >= 2 && <ellipse cx={60 - length / 2 + 8} cy="76" rx={length / 2 - 4} ry="3" fill={WING_B} opacity="0.6" transform="rotate(4 60 76)" />}
      <rect x={60 - length / 2 + 6} y="78" width={length} height="7" rx="3.5" fill={BODY} />
      <circle cx={60 + length / 2 + 6} cy="80" r="7" fill={BODY} />
      {/* closed, content eyes */}
      <path d={`M${60 + length / 2 + 3} 79Q${60 + length / 2 + 5} 81 ${60 + length / 2 + 7} 79`} stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
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
