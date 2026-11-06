import { useTranslations } from "next-intl";
import type { Wheel } from "@/lib/data/stats";
import { wheelCallouts } from "./geometry";
import { RadarChart, type RadarEntry } from "./RadarChart";
import styles from "./wheel.module.css";

/** Presentational Wheel screen: chart, strongest/weakest callouts with a gentle suggestion, empty state. */
export function WheelView({ wheel }: { wheel: Wheel | null }) {
  const t = useTranslations("wheel");
  const slugs = Object.keys(wheel?.scores ?? {});

  return (
    <main className={styles.screen}>
      <h1>{t("title")}</h1>
      {wheel === null ? (
        <p role="alert">{t("loadError")}</p>
      ) : slugs.length === 0 ? (
        <section className={styles.empty}>
          <p>{t("empty")}</p>
          <p className={styles.hint}>{t("emptyHint")}</p>
        </section>
      ) : (
        <WheelContent wheel={wheel} slugs={slugs} />
      )}
    </main>
  );
}

/** Chart plus callouts for a wheel with at least one score. */
function WheelContent({ wheel, slugs }: { wheel: Wheel; slugs: string[] }) {
  const t = useTranslations("wheel");
  const tp = useTranslations("pillars");
  const entries: RadarEntry[] = slugs.map((slug) => ({
    slug,
    label: tp(`${slug}.name`),
    score: wheel.scores[slug],
  }));
  const summary = entries.map((e) => t("summaryItem", { pillar: e.label, value: Math.round(e.score) })).join(", ");
  const callouts = wheelCallouts(wheel);
  return (
    <>
      <p className={styles.hint}>{t("intro")}</p>
      <RadarChart
        entries={entries}
        labels={{
          ariaLabel: t("chartLabel", { summary }),
          tableCaption: t("tableCaption"),
          pillarHeader: t("pillarHeader"),
          valueHeader: t("valueHeader"),
          formatValue: (score) => t("value", { value: Math.round(score) }),
        }}
      />
      {callouts.strongest && (
        <section className={styles.callout} aria-labelledby="wheel-strongest">
          <h2 id="wheel-strongest">{t("strongest.title")}</h2>
          <p>
            {t("strongest.body", {
              pillar: tp(`${callouts.strongest.slug}.name`),
              value: Math.round(callouts.strongest.score),
            })}
          </p>
        </section>
      )}
      {callouts.weakest && (
        <section className={styles.callout} aria-labelledby="wheel-weakest">
          <h2 id="wheel-weakest">{t("weakest.title")}</h2>
          <p>
            {t("weakest.body", {
              pillar: tp(`${callouts.weakest.slug}.name`),
              value: Math.round(callouts.weakest.score),
            })}
          </p>
          <p>{t(`suggestion.${callouts.weakest.slug}`)}</p>
        </section>
      )}
    </>
  );
}
