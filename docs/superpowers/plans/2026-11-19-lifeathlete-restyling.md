# Lifeathlete Restyling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app to the approved "Crepúsculo vivo" direction (clear hierarchy, a color and icon per pillar, a rewarding gamification look) in dark and light, with no behavior change.

**Architecture:** Tokens first (`src/styles/tokens.css`, enforced by `contrast.test.ts`), then shared primitives (pillar color/icon helpers, `ProgressRing`, card/chip/badge classes in `ui.module.css`), then screen by screen in phases A to F. Components keep their props, data flow and tests; only markup structure, CSS modules, and a few new presentational strings change.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules + design tokens, next-intl (PT/EN), Vitest, Playwright Chromium (screenshots).

**Spec:** `docs/superpowers/specs/2026-11-19-lifeathlete-restyling-design.md` (mockup: `docs/superpowers/specs/assets/restyling-maqueta.png` and `.html`; the mockup's values are a starting point, the tests decide the final hex values).

## Global Constraints

- Tested tokens in `src/styles/tokens.css` are **6-digit hex only** (`contrast.test.ts` parses them); `scripts/build-pwa.mjs` copies the file into the offline pages. Non-tested effects (glass, shadows) may use `rgba()`/`color-mix()` tokens.
- Contrast stays WCAG AA in dark and light: text >= 4.5:1, UI components >= 3:1, on every background stop; the existing assertions keep passing.
- Dark is the default; light is automatic (`prefers-color-scheme`) and is redesigned too (same hues, darkened).
- No new dependencies and no new fonts (system font); icons and art are inline SVG.
- `backdrop-filter` only on the bottom navigation and the Today hero card, each with a `@supports not (backdrop-filter: blur(1px))` solid fallback.
- Every animation and transition is covered by the existing `prefers-reduced-motion` rule in `src/styles/base.css`; touch targets stay >= 44 px; focus ring stays visible; `[hidden]` keeps winning over `display`.
- No change to data, routes, gamification rules, Supabase, Edge Functions or the service worker/cache rules. Do not deploy `weekly-summary`.
- PT and EN for every new string; the messages parity test keeps passing.
- Commits end with the session's attribution lines; push only to `ccr-eb79cda8-tr265g`; no PRs; `main` is touched only when the user says so.

## Review Focus

- Light theme: every pillar color against `--color-surface`/`--color-bg` is >= 3:1 (icons, bars, ticks), and text on the Today hero gradient stops is >= 4.5:1 (Task 1 tests).
- Ring with `total = 0`, with `done > total`, and with the selected day other than today: no `NaN`, no overflow, the ring follows the selected day (Task 4 tests).
- A pillar slug the catalog does not know: falls back to the primary color and a neutral icon instead of throwing (Task 2 test).
- Reduced motion: the global rule survives and no module overrides it (Task 3 guard test).
- Long habit titles and the EN strings at 320 px wide: nothing overflows horizontally (Task 13 screenshot matrix).
- Offline fallback day and empty Today still render in the new layout (Task 6 tests).

---

## Phase A: Foundations

### Task 1: Tokens and contrast tests

**Files:**
- Modify: `src/styles/tokens.css`, `src/styles/contrast.test.ts`, `src/styles/base.css` (page background)
- Create: `src/styles/tokens-only.test.ts`

**Interfaces:**
- Produces (new tokens, each defined in dark and light): `--bg-top`, `--bg-bottom`, `--bg-glow-a`, `--bg-glow-b` (page gradient stops); `--hero-top`, `--hero-bottom` (hero card stops); `--color-flame` (streak); `--medal-top`, `--medal-bottom`, `--color-on-medal` (gold medallion); `--pillar-exercise`, `--pillar-nutrition`, `--pillar-nature`, `--pillar-gratitude`, `--pillar-screens`, `--pillar-lightness`, `--pillar-meditation`, `--pillar-active-lifestyle`, `--pillar-reading`, `--pillar-family`; non-hex: `--glass` (translucent surface), `--shadow-card`, `--shadow-glow`. Existing token names keep working.
- Dark pillar starting values (from the mockup): exercise `#ff8a5c`, nutrition `#a6e86a`, nature `#3ddc97`, gratitude `#ffcf5c`, screens `#5cc8ff`, lightness `#c0a0ff`, meditation `#8c9bff`, active-lifestyle `#ff6b9a`, reading `#5ce1e6`, family `#ffa987`; light variants are darker versions that pass the tests.

- [ ] **Step 1: Extend `contrast.test.ts` (failing first).** Add: all 10 `--pillar-*` tokens are hex in both themes; each pillar color vs `color-bg`, `color-surface`, `color-surface-raised`, `bg-top`, `bg-bottom` >= 3:1; `color-text`, `color-text-muted`, `color-primary`, `color-accent-gold` on `bg-top`, `bg-bottom`, `bg-glow-a`, `bg-glow-b`, `hero-top`, `hero-bottom` >= 4.5:1; `color-on-medal` on `medal-top` and `medal-bottom` >= 4.5:1; `color-flame` vs `hero-top` >= 3:1.
- [ ] **Step 2: Add `tokens-only.test.ts`:** reads every `src/**/*.module.css` and `src/styles/base.css`; fails if any contains a hex color (`#` followed by 3 to 8 hex digits) or `rgb(`/`hsl(`/`rgba(`/`hsla(` (colors must come from tokens; the repo has none today). Run `npx vitest run src/styles` and expect FAIL on the new contrast assertions.
- [ ] **Step 3: Implement the tokens** (dark default and `@media (prefers-color-scheme: light)` block) so all tests pass, keeping the calm mood: page gradient from petrol-green to indigo in dark, warm paper with soft pastel glows in light; set `body`/`html` background in `base.css` to the page gradient using the stops (fixed attachment off, no layout shift).
- [ ] **Step 4: Run** `npx vitest run src/styles && npm test`. Expected: all pass (including the offline-page tests that inline the tokens).
- [ ] **Step 5: Commit** `feat(design): Crepúsculo vivo tokens, pillar colors and contrast tests`.

### Task 2: Pillar helpers and shared primitives

**Files:**
- Move: `src/components/landing/PillarIcon.tsx` to `src/components/ui/PillarIcon.tsx` (update imports; keep the exports `PILLAR_SLUGS`, `PillarSlug`, `PillarIcon`)
- Create: `src/lib/pillars.ts`, `src/lib/pillars.test.ts`, `src/components/ui/ProgressRing.tsx`, `src/components/ui/ProgressRing.test.tsx`
- Modify: `src/components/ui/ui.module.css` (card, chip, badge, bar classes)

**Interfaces:**
- Produces: `pillarColor(slug: string): string` returns `var(--pillar-<slug>)` for the 10 known slugs and `var(--color-primary)` otherwise; `isPillarSlug(slug: string): slug is PillarSlug`; `PillarIcon` accepts any `slug: string` and renders a neutral circle glyph for unknown slugs; `ProgressRing(props: { done: number; total: number; label: string; size?: number; children?: ReactNode })` renders an SVG ring (role `img`, `aria-label={label}`), fill fraction `clamp(done/total, 0, 1)` and `0` when `total <= 0`, with `children` centered. CSS classes in `ui.module.css`: `card`, `cardHero`, `chip`, `badge`, `badgeGold`, `track`, `trackFill`.

- [ ] **Step 1: Failing tests.** `pillars.test.ts`: all 10 slugs map to their `var(--pillar-...)`; unknown and empty slugs return `var(--color-primary)`. `ProgressRing.test.tsx`: `done 4, total 10` has fraction 0.4 (assert the `stroke-dashoffset` or a `data-fraction="0.4"` attribute); `total 0` gives 0 and no `NaN` anywhere in the markup; `done 12, total 10` is clamped to 1; the label is the accessible name. Add a `PillarIcon` test for an unknown slug (no throw, renders an `svg`).
- [ ] **Step 2: Run** `npx vitest run src/lib/pillars.test.ts src/components/ui` and expect FAIL.
- [ ] **Step 3: Implement** the move, helpers and `ProgressRing` (plain SVG circles, gradient stroke from tokens `--color-success` to `--color-focus`-family token chosen in Task 1; animate the stroke offset with a CSS transition). Add the shared classes to `ui.module.css`.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npm run lint`. Expected: pass.
- [ ] **Step 5: Commit** `feat(ui): pillar color helpers, shared PillarIcon and ProgressRing`.

### Task 3: Bottom navigation and motion guard

**Files:**
- Modify: `src/components/nav/NavTabs.tsx`, `src/components/nav/nav.module.css`, `src/components/nav/NavTabs.test.tsx`
- Create: `src/styles/motion.test.ts`

**Interfaces:**
- Consumes: tokens from Task 1. `NavTabs({ pathname })` and `isActiveTab` keep their signatures.

- [ ] **Step 1: Failing tests.** In the nav test: each of the four tabs contains one `svg` with `aria-hidden="true"` and the label text; only the active tab has `aria-current="page"` (existing). `motion.test.ts`: `base.css` still contains the `prefers-reduced-motion: reduce` rule disabling animation and transition durations, and no `*.module.css` contains `animation-duration` or `transition-duration` declarations with `!important`.
- [ ] **Step 2: Run** the two tests; expect FAIL for the icons.
- [ ] **Step 3: Implement** a floating, rounded bar (margin from the screen edges, safe-area aware, `--nav-clearance` updated so content is never covered), icons per tab, the active tab with a soft realce; `backdrop-filter` with the `@supports not` solid fallback.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `feat(nav): floating icon navigation and motion guard test`.

## Phase B: Hoje

### Task 4: Today hero

**Files:**
- Create: `src/lib/today/greeting.ts`, `src/lib/today/greeting.test.ts`, `src/components/today/TodayHero.tsx`, `src/components/today/TodayHero.test.tsx`
- Modify: `src/lib/today/dates.ts` (add `hourIn`), `src/components/today/TodayView.tsx` (replace `<h1>` + `HeaderStats` block by header + `TodayHero`), `src/components/today/HeaderStats.tsx` (delete or reduce to what the hero reuses), `src/components/today/today.module.css`, `src/messages/pt.json`, `src/messages/en.json`
- Modify tests that referenced the old header markup (`TodayView.test.tsx`).

**Interfaces:**
- Produces: `hourIn(timezone: string, now?: Date): number` (0 to 23, in that IANA timezone); `greetingKey(hour: number): "morning" | "afternoon" | "evening"` (5 to 11 morning, 12 to 18 afternoon, otherwise evening); `TodayHero(props: { stats: HeaderStats; done: number; total: number; dayLabel: string })`. New i18n keys: `today.greeting.morning|afternoon|evening` ("Bom dia / Boa tarde / Boa noite", "Good morning / Good afternoon / Good evening"), `today.ring.label` (PT "{done} de {total} hábitos feitos", EN "{done} of {total} habits done"), `today.ring.of` (PT "de {total} {day}", EN "of {total} {day}").
- Consumes: `levelFromXp` (`supabase/functions/_shared/engine/levels.ts`, imported relatively as `stats.ts` does) for `xpIntoLevel`, `xpForNext`, `tier`; tier names from `achievements.tier.<n>`; `ProgressRing`, `HeaderStats` type.

- [ ] **Step 1: Failing tests.** `greeting.test.ts`: hours 5 and 11 morning, 12 and 18 afternoon, 19, 23, 0 and 4 evening; `hourIn("Pacific/Auckland", fixedDate)` differs correctly from UTC. `TodayHero.test.tsx`: renders level, tier name, XP text (`{into} / {next}` style via existing XP strings), streak count, ring label "4 de 10 hábitos feitos"; `total 0` renders the empty hero without `NaN`; `done > total` clamps; the legend uses the day label passed in ("hoje", "ontem", "há 2 dias"). `TodayView.test.tsx`: selecting "Ontem" makes the ring use yesterday's `done/total` and legend (Review Focus 2).
- [ ] **Step 2: Run** `npx vitest run src/lib/today src/components/today`; expect FAIL.
- [ ] **Step 3: Implement.** The greeting is computed in the client after mount (state set in an effect, using the profile timezone), and shows only the date before that; the date is formatted with `Intl.DateTimeFormat` for the locale. `done` and `total` come from the selected day's `TodayData` (`isComplete` over all habits); hero card uses `cardHero` with the `--hero-*` gradient and the glass fallback rule from Global Constraints.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `feat(today): hero card with progress ring, level and streak`.

### Task 5: Day strip, pillar cards and habit rows

**Files:**
- Modify: `src/components/today/DayStrip.tsx`, `PillarGroup.tsx`, `HabitRow.tsx`, `ValuePicker.tsx`, `today.module.css`, and their existing tests only where markup assertions change.

**Interfaces:**
- Consumes: `pillarColor`, `PillarIcon`, `isPillarSlug` (Task 2). Props of `DayStrip`, `PillarGroup`, `HabitRow`, `ValuePicker` do not change; each pillar card sets a CSS custom property `--pillar` inline from `pillarColor(pillar.slug)` that the module CSS uses.

- [ ] **Step 1: Failing tests.** `PillarGroup`: renders the pillar icon (an `svg`) and keeps the collapse button behavior (`aria-expanded`, `hidden` list) and the "done of total" text; an unknown slug renders without throwing. `HabitRow`: the check habit keeps `aria-pressed`; a done value habit shows the done marker and provider text; pending marker kept. `DayStrip`: the selected day has `aria-pressed="true"`.
- [ ] **Step 2: Run** those tests; expect FAIL where new markup is asserted.
- [ ] **Step 3: Implement** the cards (icon tile in the pillar color, done ticks as dots, collapse chevron), habit rows (lateral bar in `--pillar`, filled check when done, `progress` bar in `--pillar`), day pills (selected filled), and a value picker consistent with the new look. Keep every accessible name and role.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `feat(today): pillar cards, habit rows and day pills`.

### Task 6: Today states and checkpoint

**Files:**
- Modify: `src/components/today/TodayView.tsx` (empty, loading, notices), `XpToast.tsx`, `today.module.css`, `src/components/today/TodayView.test.tsx`
- Create (scratchpad only, never committed): a Playwright script `shoot-restyle.cjs`

**Interfaces:**
- Produces: PNGs of each screen (dark and light, 390 px and desktop) saved in the session scratchpad. Authenticated screens are rendered through a **temporary preview route with fixture data** (as in earlier phases of this project) that is **deleted before every commit**; run `npm run build` and `npx tsc --noEmit` again after deleting it (stale `.next/types`).

- [ ] **Step 1: Failing tests.** `TodayView` with `pillars: []` shows the empty message inside the new layout and a ring of 0/0 without `NaN`; the offline fallback notice and the stale fallback notice still render with their retry button; the XP toast keeps `role` and dismiss behavior.
- [ ] **Step 2: Implement** the state styles (empty with a friendly dragonfly mini illustration reusing `Mascot`, notices as soft-tinted cards, toast with gold accent).
- [ ] **Step 3: Run all gates** `npm test && npx tsc --noEmit && npm run lint && npm run build`; then take screenshots of Hoje (dark, light, 390 px, EN, 320 px) and read them against the mockup; fix visible problems.
- [ ] **Step 4: Commit** `feat(today): empty, loading and notice states in the new look`. **Checkpoint:** send the Hoje screenshots to the user before Phase C.

## Phase C: Conquistas

### Task 7: Achievements screen

**Files:**
- Modify: `src/components/achievements/AchievementsView.tsx`, `MedalGrid.tsx`, `XpBar.tsx`, `achievements.module.css`, `src/components/mascot/mascot.module.css` (glow and size only), `src/components/share/share.module.css`, existing tests where markup assertions change.

**Interfaces:**
- Consumes: `Mascot` props unchanged; `--medal-*`, `--color-flame`, `--color-accent-gold` tokens; `ShareButton` props unchanged.

- [ ] **Step 1: Failing tests.** `MedalGrid`: unlocked medals render with an `unlocked` marker class/attribute and the unlock date text; locked medals show `{current} de {target} dias` when progress exists; the grid has two columns semantics unchanged (list). `AchievementsView`: stats tiles contain an icon `svg` (`aria-hidden`) next to "Sequência atual" and "Melhor sequência"; resting mascot text still renders.
- [ ] **Step 2: Run**; expect FAIL on new assertions.
- [ ] **Step 3: Implement** the hero (large mascot with glow and sparkles, level badge, tier, XP bar), icon tiles for streaks, the share button as the indigo call to action, gold medallions for unlocked and grayscale for locked.
- [ ] **Step 4: Run** all gates; screenshot dark and light; commit `feat(achievements): mascot hero, stat tiles and gold medals`. **Checkpoint:** send screenshots.

## Phase D: Roda

### Task 8: Radar and insight cards

**Files:**
- Modify: `src/components/wheel/RadarChart.tsx`, `WheelView.tsx`, `wheel.module.css`, `RadarChart.test.tsx`, `WheelView.test.tsx`

**Interfaces:**
- Consumes: `RadarEntry = { slug: string; label: string; score: number }` and `RadarLabels` unchanged; `pillarColor`.

- [ ] **Step 1: Failing tests.** `RadarChart`: the polygon uses a gradient fill (a `linearGradient` or `radialGradient` element is present); each axis point has a data attribute or `fill` using that pillar's `var(--pillar-...)`; the accessible summary and the data table caption still exist; fewer than `MIN_RADAR_AXES` still shows the existing fallback. `WheelView`: strongest and weakest cards render their pillar name colored by `pillarColor` and keep the suggestion text.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement** the gradient radar, colored points and labels (labels must stay legible: text uses `--color-text`, only the dot and a small tick use the pillar color), the two insight cards and the suggestion with an icon.
- [ ] **Step 4: Run** all gates; screenshots; commit `feat(wheel): gradient radar and colored insight cards`. **Checkpoint:** send screenshots.

## Phase E: Perfil, Gerir hábitos, Integrações

### Task 9: Profile area and shared form controls

**Files:**
- Modify: `src/components/profile/profile.module.css`, `HabitItem.tsx`, `HabitManager.tsx`, `AddHabitForm.tsx`, `LanguageSwitch.tsx`, `SignOutButton.tsx`, `integrations/HealthIntegrationView.tsx`, `src/components/ui/ui.module.css` (buttons, inputs), existing profile and integrations tests only where markup changes.
- Modify the profile page layouts under `src/app/[locale]/(app)/profile/**` (class names only).

**Interfaces:**
- Consumes: `card`, `chip`, `badge` classes (Task 2), `pillarColor`, `PillarIcon`. All props and accessible names stay.

- [ ] **Step 1: Failing tests.** `HabitItem`: shows the pillar icon and keeps the active toggle label, the target form, the archive confirm and the auto-fill select. `HealthIntegrationView`: connected and unavailable states keep their texts and buttons inside cards. Existing profile tests keep passing unchanged where their assertions are about roles and names.
- [ ] **Step 2: Implement** profile as a list of cards (language, links to Gerir hábitos and Integrações with icons, sign out), habit items grouped with pillar icon and color, inputs/selects/buttons restyled once in `ui.module.css` and `base.css` (primary, secondary, ghost, danger variants; `:focus-visible` unchanged).
- [ ] **Step 3: Run** all gates; screenshots of Perfil, Gerir hábitos, Integrações (dark and light); commit `feat(profile): cards, pillar identity and restyled controls`. **Checkpoint:** send screenshots.

## Phase F: Onboarding, auth, landing, offline, share card

### Task 10: Onboarding and authentication screens

**Files:**
- Modify: `src/components/onboarding/onboarding.module.css`, `PillarChoice.tsx`, `ChoosePillarsStep.tsx`, `PillarsIntroStep.tsx`, `DragonflyStep.tsx`, `StepHeader.tsx`, `StepNav.tsx`; `src/components/auth/*.tsx` and the auth page layout class names; existing tests where markup changes.

- [ ] **Step 1: Failing tests.** `PillarChoice`: renders the pillar icon and color and keeps its checkbox semantics and label; `ChoosePillarsStep` keeps the selected-count text; login and password forms keep labels, `required`, error `role="alert"`.
- [ ] **Step 2: Implement** the pillar picker as colorful selectable tiles, a calmer stepper header, the login hero with the dragonfly and the gradient background.
- [ ] **Step 3: Run** all gates; screenshots of onboarding steps and login; commit `feat(onboarding): colorful pillar tiles and restyled auth screens`.

### Task 11: Landing page

**Files:**
- Modify: `src/components/landing/*.module.css`, `Hero.tsx`, `HeroArt.tsx`, `PillarsSection.tsx`, `HowItWorks.tsx`, `SeeIt.tsx`, `DragonflySection.tsx`, `FinalCta.tsx`, `LandingFooter.tsx` (use the shared `PillarIcon` import path), `src/styles/tokens.css` landing tokens, `src/components/landing/Landing.test.tsx`, `public/landing/*` screenshots regenerated.

- [ ] **Step 1: Failing tests.** `Landing.test.tsx`: the 10 pillars render with their icons; the CTA links to login; headings and alt texts keep their i18n keys. `contrast.test.ts` landing grid keeps passing with the new landing stops.
- [ ] **Step 2: Implement** the landing in the new palette and gradients; regenerate `public/landing/today-*.webp`, `wheel-*.webp` and `og.png` from the new Hoje and Roda screens (same file names and sizes as today).
- [ ] **Step 3: Run** all gates; screenshots dark and light; commit `feat(landing): restyled landing page and refreshed screenshots`.

### Task 12: Offline pages and share card

**Files:**
- Modify: `scripts/build-pwa.mjs` (offline page styles), `public/offline/{pt,en}.html` (regenerated by the build), `supabase/functions/weekly-summary/summary.ts` (card colors and layout via its existing constants), its tests, `src/lib/data/share.test.ts` if assertions on colors exist.

- [ ] **Step 1: Failing tests.** The existing offline page tests (token inlining, no external requests) and a new assertion that the generated pages contain the new `--bg-top` token; `summary` tests keep the privacy rules (no name, no health detail) and the card still renders level, streak and wheel.
- [ ] **Step 2: Implement** the offline page in the new look (gradient, card) from the same tokens; restyle the share card with hex constants from the dark palette (it renders to PNG in the browser and must not read CSS variables). Do **not** deploy `weekly-summary`; report that the deployed copy still uses the old card until the user decides to redeploy.
- [ ] **Step 3: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build`; open the generated offline page and the card in screenshots; commit `feat: restyled offline pages and share card`.

### Task 13: Final verification and review

- [ ] **Step 1: Screenshot matrix** with Playwright over every screen: dark and light, 390 px and desktop, PT and EN, plus 320 px for Hoje, Perfil, Gerir hábitos and onboarding (Review Focus 5: no horizontal scroll, no clipped text). Fix what shows.
- [ ] **Step 2: Gates:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:db`; the CSS size of the build output is not larger than 1.5x the previous build's (report both numbers).
- [ ] **Step 3: Independent review** (most capable model) over `git diff` from the spec commit `ded1a14` to HEAD, briefed with the Global Constraints and Review Focus; apply Critical and Important findings and re-run the gates.
- [ ] **Step 4:** Push the branch and report to the user what changed, the screenshots, and that production needs a merge to `main` (only with the user's go-ahead).
