-- RLS and grants. Deny by default: revoke everything, then grant explicitly.

alter table public.pillars enable row level security;
alter table public.pillar_i18n enable row level security;
alter table public.habit_templates enable row level security;
alter table public.habit_templates_i18n enable row level security;
alter table public.achievements enable row level security;
alter table public.achievements_i18n enable row level security;
alter table public.profiles enable row level security;
alter table public.user_habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.user_stats enable row level security;
alter table public.pillar_scores enable row level security;
alter table public.user_achievements enable row level security;
alter table public.mascot_state enable row level security;
alter table public.provider_connections enable row level security;
alter table public.provider_activity enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- Catalog: public read-only
grant select on public.pillars, public.pillar_i18n, public.habit_templates,
  public.habit_templates_i18n, public.achievements, public.achievements_i18n to anon, authenticated;
create policy catalog_read on public.pillars for select to anon, authenticated using (true);
create policy catalog_read on public.pillar_i18n for select to anon, authenticated using (true);
create policy catalog_read on public.habit_templates for select to anon, authenticated using (true);
create policy catalog_read on public.habit_templates_i18n for select to anon, authenticated using (true);
create policy catalog_read on public.achievements for select to anon, authenticated using (true);
create policy catalog_read on public.achievements_i18n for select to anon, authenticated using (true);

-- Client-writable user tables: select/insert/update own rows (no delete)
grant select, insert, update on public.profiles, public.user_habits, public.habit_logs to authenticated;

create policy profiles_select on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_habits_select on public.user_habits for select to authenticated using (user_id = auth.uid());
create policy user_habits_insert on public.user_habits for insert to authenticated with check (user_id = auth.uid());
create policy user_habits_update on public.user_habits for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- habit_logs: the referenced habit must belong to the caller (in addition to the composite FK)
create policy habit_logs_select on public.habit_logs for select to authenticated using (user_id = auth.uid());
create policy habit_logs_insert on public.habit_logs for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.user_habits h where h.id = user_habit_id and h.user_id = auth.uid())
);
create policy habit_logs_update on public.habit_logs for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.user_habits h where h.id = user_habit_id and h.user_id = auth.uid())
  );

-- Server-written tables (Edge Functions with service_role): client can only read own rows
grant select on public.user_stats, public.pillar_scores, public.user_achievements,
  public.mascot_state, public.provider_activity to authenticated;
create policy user_stats_select on public.user_stats for select to authenticated using (user_id = auth.uid());
create policy pillar_scores_select on public.pillar_scores for select to authenticated using (user_id = auth.uid());
create policy user_achievements_select on public.user_achievements for select to authenticated using (user_id = auth.uid());
create policy mascot_state_select on public.mascot_state for select to authenticated using (user_id = auth.uid());
create policy provider_activity_select on public.provider_activity for select to authenticated using (user_id = auth.uid());

-- provider_connections: column grants expose status only; tokens stay server-side
grant select (id, user_id, provider, status, last_synced_at) on public.provider_connections to authenticated;
create policy provider_connections_select on public.provider_connections for select to authenticated using (user_id = auth.uid());
