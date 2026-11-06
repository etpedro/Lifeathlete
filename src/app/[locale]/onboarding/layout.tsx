import type { ReactNode } from "react";
import { guardArea } from "@/lib/auth/guard";

/** Onboarding needs a session; users who already finished it go to Today. */
export default async function OnboardingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await guardArea("onboarding", (await params).locale);
  return children;
}
