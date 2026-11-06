import { Mascot } from "@/components/mascot/Mascot";
import { polygonPoints, radarPoint, type Circle } from "@/components/wheel/geometry";
import styles from "./heroArt.module.css";

const SIZE = 400;
const WHEEL: Circle = { cx: 200, cy: 254, radius: 118 };
const AXES = 10;
const RINGS = [25, 50, 75, 100];
/** An illustrative, fairly balanced wheel (not anyone's data). */
const SCORES = [80, 66, 72, 88, 58, 70, 62, 76, 84, 68];
const DOT_TONES = ["toneA", "toneB", "toneC", "toneD"] as const;
const STARS: [number, number, number][] = [
  [34, 58, 1.6],
  [88, 22, 1.1],
  [342, 40, 1.8],
  [372, 118, 1.2],
  [22, 168, 1.1],
  [380, 222, 1.4],
  [58, 330, 1.2],
  [356, 352, 1.1],
  [150, 30, 0.9],
  [262, 18, 1.2],
];

/**
 * The hero illustration: the dragonfly (stage 5, bright) floating over a softly glowing
 * Wheel of Life. Pure SVG and CSS; the float and glow stop under prefers-reduced-motion.
 * Decorative (aria-hidden): the headline carries the meaning.
 */
export function HeroArt({ mascotLabel }: { mascotLabel: string }) {
  const ring = (score: number) => polygonPoints(Array.from({ length: AXES }, () => score), WHEEL);
  return (
    <div className={styles.art} aria-hidden="true">
      <div className={styles.glow} data-landing-glow="" />
      <svg className={styles.wheel} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
        {STARS.map(([x, y, r], i) => (
          <circle key={`${x}-${y}`} className={i % 3 === 0 ? `${styles.star} ${styles.twinkle}` : styles.star} cx={x} cy={y} r={r} />
        ))}
        <circle className={styles.halo} cx={WHEEL.cx} cy={WHEEL.cy} r={WHEEL.radius + 22} />
        {RINGS.map((r) => (
          <polygon key={r} className={styles.ring} points={ring(r)} />
        ))}
        {Array.from({ length: AXES }, (_, i) => {
          const end = radarPoint(i, AXES, 100, WHEEL);
          return <line key={i} className={styles.axis} x1={WHEEL.cx} y1={WHEEL.cy} x2={end.x} y2={end.y} />;
        })}
        <polygon className={styles.area} points={polygonPoints(SCORES, WHEEL)} />
        {SCORES.map((s, i) => {
          const p = radarPoint(i, AXES, s, WHEEL);
          return <circle key={i} className={`${styles.dot} ${styles[DOT_TONES[i % DOT_TONES.length]]}`} cx={p.x} cy={p.y} r={5} />;
        })}
        {Array.from({ length: AXES }, (_, i) => {
          const p = radarPoint(i, AXES, 100, { ...WHEEL, radius: WHEEL.radius + 22 });
          return <circle key={i} className={styles.bead} cx={p.x} cy={p.y} r={3} />;
        })}
      </svg>
      <div className={styles.float} data-landing-float="">
        <Mascot stage={5} variant="bright" description={mascotLabel} />
      </div>
    </div>
  );
}
