import { redirect } from "next/navigation";

/** `/{locale}` has no screen of its own: go to Today (the guards handle login/onboarding). */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/today`);
}
