import { isPillarSlug } from "@/components/ui/PillarIcon";

export { isPillarSlug };

/** The CSS color of a pillar (its token); the primary color for unknown slugs. */
export function pillarColor(slug: string): string {
  return isPillarSlug(slug) ? `var(--pillar-${slug})` : "var(--color-primary)";
}
