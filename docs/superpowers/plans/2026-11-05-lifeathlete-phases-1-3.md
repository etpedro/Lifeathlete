# Lifeathlete Fases 1-3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma PWA bilingue (PT/EN) onde o utilizador faz o check-in diário dos 10 pilares de "O Atleta da Vida" e ganha XP, níveis, streaks, conquistas, roda de equilíbrio e mascote.

**Architecture:** Next.js (App Router) fala com Supabase via `supabase-js`. As regras de gamificação são funções puras em `supabase/functions/_shared/engine/`, testadas com Vitest e chamadas por uma Edge Function idempotente que recalcula as tabelas de estatísticas (únicas escritas que o cliente não pode fazer).

**Tech Stack:** Next.js + TypeScript, `@supabase/ssr`, `next-intl`, Vitest, Playwright, Supabase CLI (pgTAP para RLS), Serwist (service worker).

**Spec:** `docs/superpowers/specs/2026-11-05-lifeathlete-design.md`

**Fora deste plano:** integrações de fornecedores (fase 4), RGPD/publicação/push (fase 5), app nativa (fase 6).

## Global Constraints

- Idiomas: `pt` (PT-PT) e `en`; toda a cópia visível vem de `src/messages/{pt,en}.json`, nunca fixa no código.
- 10 pilares com slugs: `exercise`, `nutrition`, `nature`, `gratitude`, `screens`, `lightness`, `meditation`, `active-lifestyle`, `reading`, `family`.
- XP: 10 por hábito cumprido/dia (proporcional ao progresso, máx. 10); +20 por dia completo; +30 semanais de equilíbrio (todos os pilares ativos com atividade em pelo menos 4 dias da semana).
- Níveis: `xpForLevel(n) = round(100 * n^1.5)` é o XP para passar do nível `n` ao `n+1`; começa-se no nível 1 com 0 XP. Nomes em escalões de 5 níveis: Iniciante, Curioso, Praticante, Atleta, Atleta da Vida (nível 21 em diante).
- Streak: dias seguidos com pelo menos 1 hábito cumprido; 1 dia de perdão por semana ISO.
- Roda: percentagem de hábitos cumpridos nos últimos 30 dias, por pilar.
- Mascote: 5 estágios ligados ao escalão do nível; variante `dim|normal|bright` conforme o equilíbrio.
- Preenchimento retroativo: até 2 dias atrás.
- `user_stats`, `pillar_scores`, `user_achievements`, `mascot_state`: só escritos pelo servidor (RLS bloqueia o cliente).
- Datas sempre no fuso `profiles.timezone`, formato `YYYY-MM-DD`.
- Valores de gamificação ficam em `config.ts` (uma só fonte), nunca duplicados.

## Review Focus

1. Registo às 23:59 em Lisboa (e dia de mudança de hora): o dia local conta, não o dia UTC (Task 5).
2. Replay offline do mesmo check-in duas vezes: um só registo, XP não duplica (Tasks 3, 7, 9).
3. Hábito de valor acima da meta (ex.: 200%) ou com meta 0: XP limitado a 10, sem divisão por zero (Task 4).
4. Utilizador sem hábitos ativos: sem bónus de dia completo, roda vazia sem erro (Tasks 4, 6).
5. Hábito desativado ou apagado: o histórico e os streaks passados mantêm-se (Tasks 5, 10).

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `src/app/layout.tsx`, `src/lib/smoke.test.ts`, `.env.example`, `.gitignore`

**Interfaces:**
- Produces: scripts `npm test` (Vitest), `npm run dev`, `npm run build`, `npm run lint`.

- [ ] **Step 1:** Criar a app Next.js com TypeScript e App Router; adicionar Vitest (`include: ["src/**/*.test.ts","supabase/functions/_shared/**/*.test.ts"]`).
- [ ] **Step 2:** Escrever `smoke.test.ts` com `expect(1 + 1).toBe(2)`; correr `npm test`. Esperado: 1 passed.
- [ ] **Step 3:** Correr `npm run build`. Esperado: build sem erros.
- [ ] **Step 4:** Commit `chore: scaffold nextjs project with vitest`.

### Task 2: i18n PT/EN

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/messages/pt.json`, `src/messages/en.json`, `src/middleware.ts`
- Modify: `src/app/layout.tsx` → mover para `src/app/[locale]/layout.tsx`
- Test: `src/messages/messages.test.ts`

**Interfaces:**
- Produces: rotas `/{pt|en}/...`; `useTranslations(ns)` de `next-intl`; locale por defeito `pt`; namespaces `common`, `onboarding`, `today`, `wheel`, `achievements`, `profile`, `pillars.<slug>`.

- [ ] **Step 1:** Teste `messages.test.ts`: a lista achatada de chaves de `pt.json` é igual à de `en.json`; nenhuma string vazia; existem `pillars.<slug>.name` para os 10 slugs. Correr. Esperado: FAIL (ficheiros inexistentes).
- [ ] **Step 2:** Configurar `next-intl` com `locales: ["pt","en"]`, `defaultLocale: "pt"`; criar os dois JSON com `common` e os nomes dos 10 pilares (PT conforme o diagrama; EN traduzido).
- [ ] **Step 3:** Correr o teste. Esperado: PASS.
- [ ] **Step 4:** Commit `feat: add pt/en i18n`.

### Task 3: Schema, RLS e catálogo

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_seed_catalog.sql`, `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces: tabelas `pillars`, `pillar_i18n`, `habit_templates`, `habit_templates_i18n`, `achievements`, `achievements_i18n`, `profiles`, `user_habits`, `habit_logs`, `user_stats`, `pillar_scores`, `user_achievements`, `mascot_state`, conforme a secção 3 do spec; `habit_logs` com `unique (user_habit_id, date)`; `user_habits.active boolean`; apagar um `user_habit` faz soft-delete (`deleted_at`), nunca remove `habit_logs`.

- [ ] **Step 1:** Escrever `rls.test.sql` (pgTAP) com dois utilizadores A e B: A não vê `user_habits` de B; A não consegue `insert`/`update` em `user_stats`, `pillar_scores`, `user_achievements`, `mascot_state`; A lê o catálogo; inserir dois `habit_logs` iguais viola a chave única. Correr `supabase test db`. Esperado: FAIL.
- [ ] **Step 2:** Escrever as migrações (RLS ativo em todas as tabelas de utilizador; políticas `select/insert/update` por `auth.uid() = user_id` só em `profiles`, `user_habits`, `habit_logs`; apenas `select` nas tabelas escritas pelo servidor; catálogo `select` público).
- [ ] **Step 3:** Seed: 10 pilares e 2-4 `habit_templates` por pilar com `i18n` PT/EN (ex.: `meditation` → "Meditar 10 min", `value`, 10 min; `screens` → "Menos de 2h de ecrã", `check`).
- [ ] **Step 4:** `supabase db reset && supabase test db`. Esperado: todos os testes passam.
- [ ] **Step 5:** Commit `feat: add schema, rls and catalog seed`.

### Task 4: Motor, parte 1 (config, XP, níveis)

**Files:**
- Create: `supabase/functions/_shared/engine/types.ts`, `config.ts`, `xp.ts`, `levels.ts`
- Test: `supabase/functions/_shared/engine/xp.test.ts`, `levels.test.ts`

**Interfaces:**
- Produces:
  - `type Completion = { habitId: string; pillarId: string; date: string; progress: number }` (`progress` 0..n, 1 = meta cumprida)
  - `ENGINE_CONFIG = { xpPerHabit: 10, dayCompleteBonus: 20, weeklyBalanceBonus: 30, balanceMinDays: 4, freezePerWeek: 1, wheelWindowDays: 30, backfillDays: 2 }`
  - `dayXp(dayCompletions: Completion[], activeHabitCount: number): number`
  - `weeklyBalanceBonus(weekCompletions: Completion[], activePillarIds: string[]): number`
  - `xpForLevel(n: number): number`
  - `levelFromXp(xp: number): { level: number; tier: 1|2|3|4|5; xpIntoLevel: number; xpForNext: number }`

- [ ] **Step 1:** Testes `dayXp`: 3 hábitos ativos, 3 cumpridos → `30 + 20`; 1 de 3 → `10`; progress `0.5` → `5`; progress `2` → limitado a `10`; `activeHabitCount = 0` → `0` (sem bónus). Testes `weeklyBalanceBonus`: todos os pilares ativos com ≥4 dias → `30`; um pilar com 3 dias → `0`; lista de pilares vazia → `0`. Testes níveis: `xpForLevel(1) === 100`, `xpForLevel(4) === 800`; `levelFromXp(0)` → nível 1 tier 1; `levelFromXp(99)` nível 1; `levelFromXp(100)` nível 2; nível 21 → tier 5. Correr. Esperado: FAIL.
- [ ] **Step 2:** Implementar. `dayXp` soma `min(progress, 1) * xpPerHabit` por hábito (um por `habitId`) e o bónus só se `activeHabitCount > 0` e todos com `progress >= 1`. Meta 0 é tratada pelo chamador como `progress = 1` ao guardar (ver Task 7), nunca divisão aqui.
- [ ] **Step 3:** Correr os testes. Esperado: PASS.
- [ ] **Step 4:** Commit `feat(engine): xp and levels`.

### Task 5: Motor, parte 2 (datas e streaks)

**Files:**
- Create: `supabase/functions/_shared/engine/dates.ts`, `streaks.ts`
- Test: `dates.test.ts`, `streaks.test.ts` (mesma pasta)

**Interfaces:**
- Produces:
  - `localDate(instant: string, timezone: string): string` (`YYYY-MM-DD`)
  - `computeStreak(activeDates: string[], today: string): { current: number; best: number }`

- [ ] **Step 1:** Testes: `localDate("2026-03-29T23:59:00Z","Europe/Lisbon")` → `2026-03-30` (já em hora de verão) e `localDate("2026-01-10T23:59:00Z","Europe/Lisbon")` → `2026-01-10`; `localDate("2026-06-01T23:30:00Z","America/Sao_Paulo")` → `2026-06-01`. Streak: 5 dias seguidos até hoje → `current 5`; falha de 1 dia numa semana → mantém-se (perdão); falhas em 2 dias da mesma semana ISO → quebra; hoje ainda sem atividade mas ontem ativo → `current` mantém-se; `activeDates` vazio → `{0,0}`; datas repetidas contam uma vez. Correr. Esperado: FAIL.
- [ ] **Step 2:** Implementar com `Intl.DateTimeFormat` (`en-CA`, `timeZone`) e aritmética de datas em UTC sobre strings `YYYY-MM-DD` (sem `Date` local). O perdão é consumido por semana ISO.
- [ ] **Step 3:** Correr. Esperado: PASS.
- [ ] **Step 4:** Commit `feat(engine): local dates and streaks`.

### Task 6: Motor, parte 3 (roda, conquistas, mascote)

**Files:**
- Create: `supabase/functions/_shared/engine/wheel.ts`, `achievements.ts`, `mascot.ts`
- Test: `wheel.test.ts`, `achievements.test.ts`, `mascot.test.ts`

**Interfaces:**
- Consumes: `Completion`, `ENGINE_CONFIG`, `computeStreak` (Tasks 4-5).
- Produces:
  - `pillarScores(completions: Completion[], habitsByPillar: Record<string, string[]>, today: string): Record<string, number>` (0..100, janela de 30 dias; pilar sem hábitos ativos fica fora do resultado)
  - `balanceIndex(scores: Record<string, number>): number` (0..1, `1 - desvio_padrão/50`, limitado a 0..1; sem pilares → `0`)
  - `type AchievementRule = { type: "streak"; days: number; pillar?: string } | { type: "total"; count: number; pillar?: string } | { type: "balance"; pillars: number }`
  - `evaluateAchievements(rules: { code: string; rule: AchievementRule }[], state: { completions: Completion[]; today: string; activePillars: string[] }): string[]` (códigos cumpridos)
  - `mascotState(level: number, balance: number): { stage: 1|2|3|4|5; variant: "dim"|"normal"|"bright" }` (`bright` se `balance >= 0.75`, `dim` se `< 0.4`)

- [ ] **Step 1:** Testes: `pillarScores` com 15 de 30 dias cumpridos num hábito → `50`; ignora registos com mais de 30 dias; sem hábitos → `{}`. `balanceIndex({a:50,b:50})` → `1`; `{}` → `0`. Conquistas: streak de 30 dias em `meditation` desbloqueia `streak/30/meditation` mas não o global; `balance` com 10 pilares ativos na mesma semana. Mascote: nível 1 → stage 1; nível 21 → stage 5; balance `0.8` → `bright`. Correr. Esperado: FAIL.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Correr. Esperado: PASS.
- [ ] **Step 4:** Commit `feat(engine): wheel, achievements and mascot`.

### Task 7: Edge Function `recalculate`

**Files:**
- Create: `supabase/functions/recalculate/index.ts`, `supabase/functions/recalculate/recalculate.ts`, `supabase/functions/recalculate/recalculate.test.ts`, `supabase/migrations/0004_achievement_seed.sql`

**Interfaces:**
- Consumes: todo o motor (Tasks 4-6); tabelas da Task 3.
- Produces: `recalculateUser(db: Db, userId: string): Promise<void>` (reconstrói `user_stats`, `pillar_scores`, `user_achievements`, `mascot_state` a partir de `habit_logs`); endpoint `POST /recalculate` autenticado pelo JWT do utilizador (nunca aceita `userId` no corpo).

- [ ] **Step 1:** Teste com `Db` falso em memória: corre `recalculateUser` duas vezes sobre os mesmos logs e o estado final é idêntico (idempotente); um log com `target = 0` conta como `progress = 1`; utilizador sem hábitos → `xp_total 0`, sem erros; hábito com `deleted_at` mantém o histórico no streak. Esperado: FAIL.
- [ ] **Step 2:** Implementar `recalculateUser` (converter `habit_logs.value / target` em `progress`; agrupar por dia local; somar `dayXp` e `weeklyBalanceBonus`). `index.ts` só valida o JWT e chama a função. Semear 6 conquistas iniciais (3 por pilar `meditation`/`reading`/`exercise` de streak 30, 1 global streak 100, 1 de equilíbrio, 1 `total` 100 hábitos) com i18n PT/EN.
- [ ] **Step 3:** Correr os testes. Esperado: PASS.
- [ ] **Step 4:** Commit `feat: recalculate edge function`.

### Task 8: Autenticação e onboarding

**Files:**
- Create: `src/lib/supabase/{client,server}.ts`, `src/app/[locale]/(auth)/login/page.tsx`, `src/app/[locale]/onboarding/page.tsx`, `src/lib/data/onboarding.ts`
- Test: `src/lib/data/onboarding.test.ts`, `e2e/onboarding.spec.ts`

**Interfaces:**
- Produces: `completeOnboarding(db, input: { locale: "pt"|"en"; timezone: string; habitTemplateIds: string[] }): Promise<void>` (cria `profiles`, cria `user_habits` a partir dos templates e define `onboarded_at`); rota protegida: sem sessão → `/login`; sem `onboarded_at` → `/onboarding`.

- [ ] **Step 1:** Teste unitário: `completeOnboarding` com 3 templates cria 3 `user_habits` com `title`/`target`/`kind` copiados do template; chamar duas vezes não duplica. E2E (Playwright): conta nova → onboarding → escolher 2 pilares → chegar a `/pt/today`. Esperado: FAIL.
- [ ] **Step 2:** Implementar login (email + Google/Apple via Supabase Auth) e o fluxo de 5 passos do spec (conta/idioma, introdução dos 10 pilares, escolha de pilares e hábitos, ligação a fornecedores omitida nesta fase, primeiro check-in).
- [ ] **Step 3:** Correr unitários e e2e. Esperado: PASS.
- [ ] **Step 4:** Commit `feat: auth and onboarding`.

### Task 9: Ecrã Hoje, check-in e offline

**Files:**
- Create: `src/lib/data/today.ts`, `src/lib/offline/queue.ts`, `src/app/[locale]/(app)/today/page.tsx`, `src/components/HabitRow.tsx`
- Test: `src/lib/data/today.test.ts`, `src/lib/offline/queue.test.ts`, `e2e/checkin.spec.ts`

**Interfaces:**
- Produces:
  - `getToday(db, date: string): Promise<{ pillars: { pillarId: string; habits: { id: string; title: string; kind: "check"|"value"; target: number; value: number; source: string }[] }[] }>`
  - `logHabit(db, input: { userHabitId: string; date: string; value: number }): Promise<void>` (upsert por `(user_habit_id, date)`, `source = "manual"`; rejeita datas com mais de `backfillDays` dias de atraso ou futuras; chama `recalculate` depois)
  - `enqueueLog(input)`, `flushQueue(db): Promise<void>` (fila persistida em IndexedDB, reenvio idempotente)

- [ ] **Step 1:** Testes: `logHabit` com data 3 dias atrás → erro; data futura → erro; mesmo `(habit, date)` duas vezes → uma só linha, valor atualizado; `flushQueue` com o mesmo item duas vezes deixa uma linha. E2E: marcar um hábito → aparece "+10 XP"; ficar offline, marcar, voltar online → sincroniza. Esperado: FAIL.
- [ ] **Step 2:** Implementar o ecrã (pilares recolhíveis, um toque marca; hábito `value` abre seletor de valor; origem visível; contador "Dia completo: faltam N").
- [ ] **Step 3:** Correr testes. Esperado: PASS.
- [ ] **Step 4:** Commit `feat: today screen with offline check-in`.

### Task 10: Gestão de hábitos (Perfil)

**Files:**
- Create: `src/lib/data/habits.ts`, `src/app/[locale]/(app)/profile/habits/page.tsx`
- Test: `src/lib/data/habits.test.ts`

**Interfaces:**
- Produces: `setHabitActive(db, id: string, active: boolean)`, `updateHabitTarget(db, id: string, target: number)`, `createCustomHabit(db, input: { pillarId: string; title: string; kind: "check"|"value"; target: number })`, `archiveHabit(db, id: string)` (preenche `deleted_at`, não apaga logs).

- [ ] **Step 1:** Testes: `archiveHabit` mantém os `habit_logs` e o hábito deixa de aparecer em `getToday`; `createCustomHabit` com `title` vazio → erro; meta negativa → erro. Esperado: FAIL.
- [ ] **Step 2:** Implementar e ligar ao ecrã de gestão. Voltar a chamar `recalculate` após qualquer alteração.
- [ ] **Step 3:** Correr testes. Esperado: PASS.
- [ ] **Step 4:** Commit `feat: habit management`.

### Task 11: Roda e Conquistas (com mascote)

**Files:**
- Create: `src/lib/data/stats.ts`, `src/app/[locale]/(app)/wheel/page.tsx`, `src/app/[locale]/(app)/achievements/page.tsx`, `src/components/{RadarChart,Mascot,XpBar}.tsx`
- Test: `src/lib/data/stats.test.ts`, `e2e/gamification.spec.ts`

**Interfaces:**
- Consumes: `user_stats`, `pillar_scores`, `user_achievements`, `mascot_state` (Task 3).
- Produces: `getWheel(db): Promise<{ scores: Record<string, number>; weakest?: string; strongest?: string }>`, `getProfileStats(db): Promise<{ level: number; tier: number; xpIntoLevel: number; xpForNext: number; currentStreak: number; mascot: { stage: number; variant: string } }>`

- [ ] **Step 1:** Testes: `getWheel` sem pilares → `{ scores: {} }` sem `weakest`; com dois pilares devolve o mais fraco e o mais forte. E2E: 30 dias simulados de meditação desbloqueiam a medalha e a libelinha muda de estágio. Esperado: FAIL.
- [ ] **Step 2:** Implementar os ecrãs; mostrar a libelinha "a descansar" após 3 dias sem atividade (sem estados negativos).
- [ ] **Step 3:** Correr. Esperado: PASS.
- [ ] **Step 4:** Commit `feat: wheel, achievements and mascot screens`.

### Task 12: Partilha de imagem

**Files:**
- Create: `supabase/functions/weekly-summary/index.ts`, `src/lib/data/share.ts`, `src/components/ShareButton.tsx`
- Test: `supabase/functions/weekly-summary/summary.test.ts`

**Interfaces:**
- Produces: `buildSummaryCard(stats: { level: number; streak: number; scores: Record<string, number> }): { svg: string }` (sem nome nem valores de saúde), `shareCard(): Promise<void>` (Web Share API, com descarga como alternativa).

- [ ] **Step 1:** Teste: o SVG contém nível, streak e a roda, e **não** contém `display_name` nem valores de hábito. Esperado: FAIL.
- [ ] **Step 2:** Implementar o gerador de SVG e o botão nos ecrãs Conquistas e resumo semanal.
- [ ] **Step 3:** Correr. Esperado: PASS.
- [ ] **Step 4:** Commit `feat: shareable summary card`.

### Task 13: PWA

**Files:**
- Create: `public/manifest.webmanifest`, `src/app/sw.ts`, `public/icons/` (192/512)
- Modify: `next.config.ts` (Serwist)
- Test: `e2e/pwa.spec.ts`

**Interfaces:**
- Produces: app instalável; `/today` carrega offline depois da primeira visita.

- [ ] **Step 1:** Teste e2e: o manifesto existe com `name`, `start_url`, ícones; depois da primeira visita, com a rede cortada, `/pt/today` abre. Esperado: FAIL.
- [ ] **Step 2:** Configurar o service worker (cache do shell e do ecrã Hoje) e o manifesto.
- [ ] **Step 3:** Correr `npm run build && npx playwright test e2e/pwa.spec.ts`. Esperado: PASS.
- [ ] **Step 4:** Commit `feat: installable pwa with offline today`.

---

## Self-review (feito)

- **Cobertura do spec:** modelo de dados (T3), motor e valores (T4-6), recálculo servidor (T7), onboarding (T8), Hoje/offline/retroativo (T9), personalização (T10), Roda/Conquistas/mascote (T11), partilha (T12), PWA (T13), i18n (T2). Fora do âmbito, por escolha: integrações, RGPD, push, nativa.
- **Decisão que o spec deixava ambígua:** `xpForLevel(n)` é o XP para passar do nível n ao n+1 (não cumulativo-total), fixada em Global Constraints.
- **Consistência de tipos:** `Completion` e `ENGINE_CONFIG` definidos na Task 4 e usados nas Tasks 5-7; `recalculate` chamado por `logHabit` (T9) e por T10.
