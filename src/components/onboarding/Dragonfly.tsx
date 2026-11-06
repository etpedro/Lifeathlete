import mascot from "@/components/mascot/mascot.module.css";

/** Placeholder dragonfly mascot (decorative); colors come from the mascot tokens. */
export function Dragonfly() {
  return (
    <svg className={mascot.glow} width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
      <ellipse className={mascot.wingA} cx="38" cy="45" rx="30" ry="12" opacity="0.7" transform="rotate(-20 38 45)" />
      <ellipse className={mascot.wingA} cx="82" cy="45" rx="30" ry="12" opacity="0.7" transform="rotate(20 82 45)" />
      <ellipse className={mascot.wingB} cx="40" cy="65" rx="24" ry="9" opacity="0.6" transform="rotate(15 40 65)" />
      <ellipse className={mascot.wingB} cx="80" cy="65" rx="24" ry="9" opacity="0.6" transform="rotate(-15 80 65)" />
      <rect className={mascot.body} x="56" y="40" width="8" height="70" rx="4" />
      <circle className={mascot.body} cx="60" cy="36" r="9" />
    </svg>
  );
}
