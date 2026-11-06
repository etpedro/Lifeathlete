import { getTranslations } from "next-intl/server";

// Placeholder; the Today screen is built in Task 9.
export default async function TodayPage() {
  const t = await getTranslations("today");
  return (
    <main>
      <h1>{t("title")}</h1>
    </main>
  );
}
