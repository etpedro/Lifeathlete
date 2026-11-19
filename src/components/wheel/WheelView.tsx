import { useTranslations } from "next-intl";
import { ShareButton, type ShareButtonProps } from "@/components/share/ShareButton";
import type { Wheel } from "@/lib/data/stats";
import type { CSSProperties } from "react";
import { PillarIcon } from "@/components/ui/PillarIcon";
import { pillarColor } from "@/lib/pillars";
import { wheelCallouts } from "./geometry";
import { RadarChart, type RadarEntry } from "./RadarChart";
import styles from "./wheel.module.css";

/** Presentational Wheel screen: chart, strongest/weakest callouts with a gentle suggestion, empty state. */
export function WheelView({ wheel, share }: { wheel: Wheel | null; share?: ShareButtonProps | null }) {
  const t = useTranslations("wheel");
  const slugs = Object.keys(wheel?.scores ?? {});

  return (
    <main className={styles.screen}>
      <h1>{t("title")}</h1>
      {wheel === null ? (
        <p role="alert" className={styles.alert}>
          {t("loadError")}
        </p>
      ) : slugs.length === 0 ? (
        <section className={styles.empty}>
          <p>{t("empty")}</p>
          <p className={styles.hint}>{t("emptyHint")}</p>
        </section>
      ) : (
        <WheelContent wheel={wheel} slugs={slugs} />
      )}
      {share && <ShareButton {...share} />}
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
      <div className={styles.two}>
        {callouts.strongest && (
          <Callout
            id="wheel-strongest"
            title={t("strongest.title")}
            slug={callouts.strongest.slug}
            name={tp(`${callouts.strongest.slug}.name`)}
            body={t("strongest.body", {
              pillar: tp(`${callouts.strongest.slug}.name`),
              value: Math.round(callouts.strongest.score),
            })}
          />
        )}
        {callouts.weakest && (
          <Callout
            id="wheel-weakest"
            weak
            title={t("weakest.title")}
            slug={callouts.weakest.slug}
            name={tp(`${callouts.weakest.slug}.name`)}
            body={t("weakest.body", {
              pillar: tp(`${callouts.weakest.slug}.name`),
              value: Math.round(callouts.weakest.score),
            })}
            suggestion={t(`suggestion.${callouts.weakest.slug}`)}
          />
        )}
      </div>
    </>
  );
}

/** A glass insight card: pillar icon tile + name in the pillar's color family, body, optional suggestion. */
function Callout({
  id,
  title,
  slug,
  name,
  body,
  suggestion,
  weak,
}: {
  id: string;
  title: string;
  slug: string;
  name: string;
  body: string;
  suggestion?: string;
  weak?: boolean;
}) {
  return (
    <section
      className={`${styles.callout} ${weak ? styles.calloutWeak : ""}`}
      style={{ "--pillar": pillarColor(slug) } as CSSProperties}
      aria-labelledby={id}
    >
      <h2 id={id} className={styles.calloutTitle}>
        {title}
      </h2>
      <div className={styles.calloutPillar}>
        <span aria-hidden="true" className={styles.pillarTile}>
          <PillarIcon slug={slug} />
        </span>
        <span className={styles.pillarName}>{name}</span>
      </div>
      <p className={styles.calloutBody}>{body}</p>
      {suggestion && (
        <p className={styles.suggestion}>
          <svg
            data-suggestion-icon
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
            <path d="M19 16v4M17 18h4" />
          </svg>
          <span>{suggestion}</span>
        </p>
      )}
    </section>
  );
}
