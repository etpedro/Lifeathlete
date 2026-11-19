/** Time-of-day greeting: 5 to 11 morning, 12 to 18 afternoon, otherwise evening. */
export function greetingKey(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 18) return "afternoon";
  return "evening";
}
