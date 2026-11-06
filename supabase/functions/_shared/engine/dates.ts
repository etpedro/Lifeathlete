/**
 * Calendar date (YYYY-MM-DD) of an instant in an IANA timezone.
 * Throws a clear Error on a malformed instant or an unknown timezone.
 */
export function localDate(instant: string, timezone: string): string {
  const date = new Date(instant);
  if (typeof instant !== "string" || instant === "" || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid instant: "${instant}"`);
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new Error(`Invalid timezone: "${timezone}"`);
  }
  const parts = formatter.formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
