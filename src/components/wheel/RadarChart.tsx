import { clampScore, polygonPoints, radarPoint, type Circle } from "./geometry";
import styles from "./wheel.module.css";

export type RadarEntry = { slug: string; label: string; score: number };
export type RadarLabels = {
  /** aria-label of the chart (already includes the per-pillar summary). */
  ariaLabel: string;
  tableCaption: string;
  pillarHeader: string;
  valueHeader: string;
  /** Formats a score for display, e.g. "50%". */
  formatValue: (score: number) => string;
};

const SIZE = 320;
const CIRCLE: Circle = { cx: SIZE / 2, cy: SIZE / 2, radius: 110 };
const RINGS = [25, 50, 75, 100];

/** Fewer than 3 axes cannot form a polygon: show a simple bar list instead. */
export const MIN_RADAR_AXES = 3;

function ScoreTable({ entries, labels }: { entries: RadarEntry[]; labels: RadarLabels }) {
  return (
    <table className={styles.srOnly}>
      <caption>{labels.tableCaption}</caption>
      <thead>
        <tr>
          <th scope="col">{labels.pillarHeader}</th>
          <th scope="col">{labels.valueHeader}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.slug}>
            <th scope="row">{e.label}</th>
            <td>{labels.formatValue(clampScore(e.score))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Radar chart of pillar scores: accessible SVG plus a screen-reader table; bars below 3 pillars. */
export function RadarChart({ entries, labels }: { entries: RadarEntry[]; labels: RadarLabels }) {
  if (entries.length === 0) return null;

  if (entries.length < MIN_RADAR_AXES) {
    return (
      <ul className={styles.bars} aria-label={labels.ariaLabel}>
        {entries.map((e) => {
          const score = clampScore(e.score);
          return (
            <li key={e.slug} className={styles.barRow}>
              <span>
                {e.label}: <strong>{labels.formatValue(score)}</strong>
              </span>
              <div className={styles.barTrack} aria-hidden="true">
                <div className={styles.barFill} style={{ width: `${score}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  const n = entries.length;
  const scores = entries.map((e) => clampScore(e.score));
  return (
    <div className={styles.chartCard}>
      <svg className={styles.chart} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={labels.ariaLabel}>
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            className={styles.grid}
            points={polygonPoints(Array.from({ length: n }, () => ring), CIRCLE)}
          />
        ))}
        {entries.map((e, i) => {
          const end = radarPoint(i, n, 100, CIRCLE);
          return <line key={e.slug} className={styles.axis} x1={CIRCLE.cx} y1={CIRCLE.cy} x2={end.x} y2={end.y} />;
        })}
        <polygon className={styles.area} points={polygonPoints(scores, CIRCLE)} />
        {scores.map((s, i) => {
          const p = radarPoint(i, n, s, CIRCLE);
          return <circle key={entries[i].slug} className={styles.dot} cx={p.x} cy={p.y} r={3.5} />;
        })}
        {entries.map((e, i) => {
          const p = radarPoint(i, n, 100, { ...CIRCLE, radius: CIRCLE.radius + 18 });
          return (
            <text key={e.slug} className={styles.axisLabel} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle">
              {i + 1}
            </text>
          );
        })}
      </svg>
      <ol className={styles.legend} aria-hidden="true">
        {entries.map((e, i) => (
          <li key={e.slug}>
            <span className={styles.legendNum}>{i + 1}</span>
            <span>
              {e.label} · {labels.formatValue(scores[i])}
            </span>
          </li>
        ))}
      </ol>
      <ScoreTable entries={entries} labels={labels} />
    </div>
  );
}
