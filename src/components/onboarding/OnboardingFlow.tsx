"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { emptySelection, selectedTemplateIds } from "@/lib/onboarding/selection";
import { ChoosePillarsStep } from "./ChoosePillarsStep";
import { DragonflyStep } from "./DragonflyStep";
import { LanguageStep } from "./LanguageStep";
import { PillarsIntroStep } from "./PillarsIntroStep";
import { StepHeader } from "./StepHeader";
import { StepNav } from "./StepNav";
import { useCatalog } from "./useCatalog";
import { useFinishOnboarding } from "./useFinishOnboarding";
import { useTimezone } from "./useTimezone";

// Spec §5 steps; "connect providers" is omitted in this phase.
const STEPS = ["language", "intro", "choose", "dragonfly"] as const;

/** Holds the step and the user's choices; each step renders one part of the flow. */
export function OnboardingFlow() {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState(emptySelection);
  const { timezone, setTimezone, valid } = useTimezone();
  const { catalog, failed: catalogFailed, retry } = useCatalog();
  const { finish, saving, failed: saveFailed } = useFinishOnboarding();

  const step = STEPS[index];
  const back = index > 0 ? () => setIndex(index - 1) : undefined;
  const next = () => setIndex(index + 1);

  return (
    <main>
      <StepHeader current={index + 1} total={STEPS.length} title={t(`${step}.title`)} />
      {step === "language" && <LanguageStep timezone={timezone} timezoneValid={valid} onTimezoneChange={setTimezone} />}
      {step === "intro" && <PillarsIntroStep />}
      {step === "choose" && (
        <ChoosePillarsStep
          catalog={catalog}
          failed={catalogFailed}
          onRetry={retry}
          selection={selection}
          onChange={setSelection}
        />
      )}
      {step === "dragonfly" && <DragonflyStep failed={saveFailed} />}
      {step === "dragonfly" ? (
        <StepNav
          onBack={back}
          onNext={() => finish(timezone, catalog ? selectedTemplateIds(catalog, selection) : [])}
          nextDisabled={saving || !valid}
          nextLabel={saving ? t("dragonfly.saving") : tCommon("finish")}
        />
      ) : (
        <StepNav
          onBack={back}
          onNext={next}
          nextDisabled={(step === "language" && !valid) || (step === "choose" && !catalog)}
        />
      )}
    </main>
  );
}
