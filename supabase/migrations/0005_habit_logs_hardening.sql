-- habit_logs hardening (controller ruling F, from the Task 3 review):
-- 1. values can never be negative (applies to every role, service_role included);
-- 2. the client (authenticated) may only write source = 'manual'; provider sources
--    ('strava', ...) are written exclusively by Edge Functions with service_role
--    (which bypasses RLS). All other policy conditions are kept unchanged.

alter table public.habit_logs add constraint habit_logs_value_nonnegative check (value >= 0);

drop policy habit_logs_insert on public.habit_logs;
create policy habit_logs_insert on public.habit_logs for insert to authenticated with check (
  user_id = auth.uid()
  and source = 'manual'
  and exists (select 1 from public.user_habits h where h.id = user_habit_id and h.user_id = auth.uid())
);

drop policy habit_logs_update on public.habit_logs;
create policy habit_logs_update on public.habit_logs for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and source = 'manual'
    and exists (select 1 from public.user_habits h where h.id = user_habit_id and h.user_id = auth.uid())
  );
