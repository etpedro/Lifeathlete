"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import type { PillarOption } from "@/lib/data/habits";
import type { HabitKind } from "@/lib/data/today";
import { validateHabitForm, type HabitFormErrors, type ProfileErrorKey } from "@/lib/profile/habit-form";
import type { MutationResult, NewHabit } from "./useHabitManager";
import styles from "./profile.module.css";

type Props = {
  pillars: PillarOption[];
  busy: boolean;
  onCreate: (input: NewHabit) => Promise<MutationResult>;
};

/** "Add custom habit": client-side validation with inline errors, then the data layer's own checks. */
export function AddHabitForm({ pillars, busy, onCreate }: Props) {
  const t = useTranslations("profile");
  const tPillars = useTranslations("pillars");
  const ids = { pillar: useId(), title: useId(), target: useId(), kind: useId() };
  const [pillarId, setPillarId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<HabitKind>("check");
  const [targetText, setTargetText] = useState("1");
  const [errors, setErrors] = useState<HabitFormErrors>({});
  const [formError, setFormError] = useState<ProfileErrorKey | null>(null);

  const pillarName = (slug: string) => (tPillars.has(`${slug}.name`) ? tPillars(`${slug}.name`) : slug);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const result = validateHabitForm({ pillarId, title, kind, targetText });
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    const failure = await onCreate(result.value);
    if (failure) return setFormError(failure);
    setTitle("");
    setKind("check");
    setTargetText("1");
  };

  const fieldError = (key: ProfileErrorKey | undefined, id: string) =>
    key && (
      <p id={`${id}-error`} role="alert" className={styles.error}>
        {t(key)}
      </p>
    );

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <h2>{t("add.title")}</h2>

      <div className={styles.field}>
        <label htmlFor={ids.pillar}>{t("add.pillar")}</label>
        <select
          id={ids.pillar}
          className={styles.select}
          value={pillarId}
          aria-invalid={Boolean(errors.pillar)}
          aria-describedby={errors.pillar ? `${ids.pillar}-error` : undefined}
          onChange={(e) => setPillarId(e.target.value)}
        >
          <option value="">{t("add.pillarPlaceholder")}</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>
              {pillarName(p.slug)}
            </option>
          ))}
        </select>
        {fieldError(errors.pillar, ids.pillar)}
      </div>

      <div className={styles.field}>
        <label htmlFor={ids.title}>{t("add.titleLabel")}</label>
        <input
          id={ids.title}
          type="text"
          className={styles.input}
          value={title}
          maxLength={200}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? `${ids.title}-error` : undefined}
          onChange={(e) => setTitle(e.target.value)}
        />
        {fieldError(errors.title, ids.title)}
      </div>

      <fieldset className={styles.field}>
        <legend>{t("add.kind")}</legend>
        <div className={styles.fieldset}>
          {(["check", "value"] as const).map((k) => (
            <label key={k} className={styles.radioLabel}>
              <input
                type="radio"
                name={ids.kind}
                className={styles.radio}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {k === "check" ? t("add.kindCheck") : t("add.kindValue")}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "value" && (
        <div className={styles.field}>
          <label htmlFor={ids.target}>{t("add.target")}</label>
          <input
            id={ids.target}
            type="text"
            inputMode="decimal"
            className={styles.input}
            value={targetText}
            aria-invalid={Boolean(errors.target)}
            aria-describedby={errors.target ? `${ids.target}-error` : undefined}
            onChange={(e) => setTargetText(e.target.value)}
          />
          {fieldError(errors.target, ids.target)}
        </div>
      )}

      {formError && (
        <p role="alert" className={styles.error}>
          {t(formError)}
        </p>
      )}
      <button type="submit" className={styles.button} disabled={busy}>
        {t("add.submit")}
      </button>
    </form>
  );
}
