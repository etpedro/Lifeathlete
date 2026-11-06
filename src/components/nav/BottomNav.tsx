"use client";

import { usePathname } from "@/i18n/navigation";
import { NavTabs } from "./NavTabs";

/** Bottom navigation: reads the (locale-less) pathname to mark the active tab. */
export function BottomNav() {
  return <NavTabs pathname={usePathname()} />;
}
