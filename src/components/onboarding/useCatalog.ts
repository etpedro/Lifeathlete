"use client";

import { useCallback, useEffect, useState } from "react";
import { loadOnboardingCatalog } from "@/lib/data/catalog";
import type { CatalogPillar } from "@/lib/onboarding/selection";
import { createClient } from "@/lib/supabase/client";

/** Loads pillars + suggested habits once; `retry` reloads after a failure. */
export function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogPillar[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadOnboardingCatalog(createClient()).then(
      (data) => !cancelled && setCatalog(data),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { catalog, failed, retry };
}
