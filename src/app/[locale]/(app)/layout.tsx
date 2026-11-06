import type { ReactNode } from "react";
import { guardArea } from "@/lib/auth/guard";

/** Everything in (app) requires a session and a finished onboarding. */
export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await guardArea("app", (await params).locale);
  return children;
}
