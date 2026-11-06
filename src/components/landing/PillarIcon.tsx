import type { ReactNode } from "react";

/** The 10 pillar slugs, in the Wheel's order (catalog sort). */
export const PILLAR_SLUGS = [
  "exercise",
  "nutrition",
  "nature",
  "gratitude",
  "screens",
  "lightness",
  "meditation",
  "active-lifestyle",
  "reading",
  "family",
] as const;
export type PillarSlug = (typeof PILLAR_SLUGS)[number];

/** Simple 24x24 stroke drawings, one per pillar (colored by currentColor). */
const ICONS: Record<PillarSlug, ReactNode> = {
  // dumbbell
  exercise: (
    <>
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />
    </>
  ),
  // apple
  nutrition: (
    <>
      <path d="M12 7.5c-1.6-1.3-4.3-1.5-5.9.1-2 2-1.8 5.9-.2 8.9 1 1.9 2.5 3.4 3.9 3 .9-.2 1.3-.6 2.2-.6s1.3.4 2.2.6c1.4.4 2.9-1.1 3.9-3 1.6-3 1.8-6.9-.2-8.9-1.6-1.6-4.3-1.4-5.9-.1z" />
      <path d="M12 7.5c0-2 .9-3.6 2.8-4.5" />
    </>
  ),
  // tree
  nature: (
    <>
      <path d="M12 3 6.5 10.5h3L5.5 16h13l-4-5.5h3z" />
      <path d="M12 16v5" />
    </>
  ),
  // heart
  gratitude: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />,
  // smartphone
  screens: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.2" />
      <path d="M11 17.5h2" />
    </>
  ),
  // feather
  lightness: (
    <>
      <path d="M19.5 4.5c-5.5 0-10 3.6-11 9.5L7.8 19.5l5.4-.9c5.4-1 7.1-6.6 6.3-14.1z" />
      <path d="M4 21 15 9.5M9.2 14.6h5.3" />
    </>
  ),
  // lotus
  meditation: (
    <>
      <path d="M12 4.5c2.3 2.6 3 6.6 0 11-3-4.4-2.3-8.4 0-11z" />
      <path d="M12 15.5c-1.6-2.8-4.6-4.6-8-4.6.3 3.8 3.6 6.4 8 6.4s7.7-2.6 8-6.4c-3.4 0-6.4 1.8-8 4.6z" />
      <path d="M6 20.5h12" />
    </>
  ),
  // bike
  "active-lifestyle": (
    <>
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l3.5-7h6L18 16M9.5 9 12.5 16H6M8.5 6.5h3M15.5 9l-1-3h2" />
    </>
  ),
  // open book
  reading: (
    <>
      <path d="M3 5.5h5.5A3.5 3.5 0 0 1 12 9v11a2.8 2.8 0 0 0-2.8-2.8H3z" />
      <path d="M21 5.5h-5.5A3.5 3.5 0 0 0 12 9v11a2.8 2.8 0 0 1 2.8-2.8H21z" />
    </>
  ),
  // users
  family: (
    <>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.5 14c2.7.1 4.5 2.4 4.5 5.2" />
    </>
  ),
};

/** A pillar's calm stroke icon. Decorative: the pillar name is next to it. */
export function PillarIcon({ slug, className }: { slug: PillarSlug; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-pillar-icon={slug}
    >
      {ICONS[slug]}
    </svg>
  );
}
