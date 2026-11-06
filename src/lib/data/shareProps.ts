import { getTranslations } from "next-intl/server";
import { cardLabels } from "./share";
import type { ShareButtonProps } from "@/components/share/ShareButton";

/**
 * Props for the share button: ONLY level, streak, scores and generic localized labels
 * reach the client (no name, e-mail, habits or dates).
 */
export async function getShareProps(
  locale: string,
  stats: { level: number; streak: number; scores: Record<string, number> },
): Promise<ShareButtonProps> {
  const t = await getTranslations({ locale, namespace: "share.card" });
  const tp = await getTranslations({ locale, namespace: "pillars" });
  const scores = { ...stats.scores };
  return {
    stats: { level: stats.level, streak: stats.streak, scores },
    labels: cardLabels((k) => t(k), (slug) => tp(`${slug}.name`), Object.keys(scores)),
    locale: locale === "en" ? "en" : "pt",
  };
}
