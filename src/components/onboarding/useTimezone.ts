"use client";

import { useState, useSyncExternalStore } from "react";
import { detectTimeZone, isValidTimeZone } from "@/lib/time/timezone";

const noSubscribe = () => () => {};

/** Device time zone (detected on the client only, so SSR stays stable) with a user override. */
export function useTimezone() {
  const detected = useSyncExternalStore(noSubscribe, detectTimeZone, () => "UTC");
  const [override, setOverride] = useState<string | null>(null);
  const timezone = override ?? detected;
  return { timezone, setTimezone: setOverride, valid: isValidTimeZone(timezone.trim()) };
}
