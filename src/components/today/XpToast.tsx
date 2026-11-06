import { useTranslations } from "next-intl";
import { useEffect } from "react";
import type { StatsFeedback } from "@/lib/today/feedback";
import styles from "./today.module.css";

export const TOAST_MS = 4000;

type Props = { feedback: StatsFeedback; onDismiss: () => void };

/** "+N XP" with level-up / new-streak notices; announced politely and dismissed after a few seconds. */
export function XpToast({ feedback, onDismiss }: Props) {
  const t = useTranslations("today.toast");
  useEffect(() => {
    const id = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(id);
  }, [feedback, onDismiss]);

  return (
    <div role="status" className={styles.toast}>
      <div>
        {feedback.xpGained !== null && <p>{t("xp", { xp: feedback.xpGained })}</p>}
        {feedback.levelUp !== null && <p>{t("levelUp", { level: feedback.levelUp })}</p>}
        {feedback.streak !== null && <p>{t("streak", { count: feedback.streak })}</p>}
      </div>
      <button type="button" className={styles.target} onClick={onDismiss}>
        {t("dismiss")}
      </button>
    </div>
  );
}
