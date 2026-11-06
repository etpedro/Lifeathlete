import { Link } from "@/i18n/navigation";
import styles from "./cta.module.css";

/** The "Entrar" call to action: the locale's login page (which sends signed-in users on to Today). */
export function CtaLink({ label }: { label: string }) {
  return (
    <Link href="/login" className={`${styles.button} ${styles.primary}`} data-cta="login">
      {label}
    </Link>
  );
}
