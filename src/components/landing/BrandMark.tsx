import styles from "./brand.module.css";

/** The small dragonfly mark (the PWA icon's shapes). Decorative. */
export function BrandMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ellipse className={styles.wingA} cx="36" cy="46" rx="26" ry="10" transform="rotate(-18 36 46)" />
      <ellipse className={styles.wingA} cx="84" cy="46" rx="26" ry="10" transform="rotate(18 84 46)" />
      <ellipse className={styles.wingB} cx="38" cy="64" rx="22" ry="8" transform="rotate(14 38 64)" />
      <ellipse className={styles.wingB} cx="82" cy="64" rx="22" ry="8" transform="rotate(-14 82 64)" />
      <rect className={styles.body} x="56" y="40" width="8" height="62" rx="4" />
      <circle className={styles.body} cx="60" cy="34" r="9" />
    </svg>
  );
}
