-- Client date window on manual habit_logs (final review F10, cheap half of the
-- "own XP inflation" finding). The client (authenticated) may only write manual logs
-- dated within [profile-local today - 3, profile-local today + 1]. The app itself only
-- writes today .. today - 2 (ENGINE_CONFIG.backfillDays = 2); the extra day each side
-- tolerates timezone and clock edges. Profile-local today = now() in profiles.timezone,
-- falling back to UTC for an invalid or missing timezone (public.safe_local_date, 0008).
-- service_role (Edge Functions, provider rows) bypasses RLS and is not limited.
-- Not addressed here (documented as a known limitation): the client can still write
-- user_habits lifetime columns (created_at, deleted_at, target, kind, pauses).

create or replace function public.habit_log_date_allowed(d date) returns boolean
language sql stable
set search_path = ''
as $$
  select d between public.safe_local_date(p.timezone) - 3 and public.safe_local_date(p.timezone) + 1
    from (select (select pr.timezone from public.profiles pr where pr.user_id = auth.uid()) as timezone) p
$$;

drop policy habit_logs_insert on public.habit_logs;
create policy habit_logs_insert on public.habit_logs for insert to authenticated with check (
  user_id = auth.uid()
  and source = 'manual'
  and public.habit_log_date_allowed(date)
  and exists (select 1 from public.user_habits h where h.id = user_habit_id and h.user_id = auth.uid())
);

drop policy habit_logs_update on public.habit_logs;
create policy habit_logs_update on public.habit_logs for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and source = 'manual'
    and public.habit_log_date_allowed(date)
    and exists (select 1 from public.user_habits h where h.id = user_habit_id and h.user_id = auth.uid())
  );
