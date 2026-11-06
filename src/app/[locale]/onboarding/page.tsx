"use client";

import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

/** Onboarding (spec §5). Access is gated by the server layout next to this page. */
export default function OnboardingPage() {
  return <OnboardingFlow />;
}
