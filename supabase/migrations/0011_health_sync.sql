-- Automatic steps, phase 1 (health-sync Edge Function). Additive only.
--
-- provider_connections consent record (written by health-sync with service_role):
--   consented_at          when the user last accepted the steps consent text;
--   consent_version       which text they accepted (health-sync only accepts its current
--                         version, and sync requires it, so a new text asks again);
--   consent_withdrawn_at  when they disconnected (null while connected).
-- None of them is added to the authenticated column-select grant of 0002, which keeps
-- exposing only (id, user_id, provider, status, last_synced_at): consent and tokens stay
-- server-side.
--
-- user_habits.auto_source: which automatic source fills a habit's daily value. Only
-- 'steps' exists, and only value habits can have one. The client may set it on its own
-- habits through the existing user_habits update grant/policy (0002).
--
-- Unchanged: the client still cannot write provider_activity, provider_connections or
-- non-manual habit_logs (0002, 0005); health-sync writes them with service_role.

alter table public.provider_connections
  add column consented_at timestamptz,
  add column consent_version text,
  add column consent_withdrawn_at timestamptz;

alter table public.user_habits
  add column auto_source text null,
  add constraint user_habits_auto_source_known check (auto_source in ('steps')),
  add constraint user_habits_auto_source_value_kind check (auto_source is null or kind = 'value');

-- Writes the automatic step logs of one sync in ONE statement, so a manual log written at
-- any time always prevails (no read-then-write window). p_rows is a JSON array of
-- { user_habit_id, date, value, target }. Defense in depth: only rows for habits that
-- belong to p_user_id, are value habits filled from 'steps' and are not deleted are
-- written; anything else is ignored silently. Returns
-- { written, skippedManual, habitsUpdated }: rows inserted or replaced, rows left alone
-- because the existing log is manual, and distinct habits written.
-- Only service_role (the health-sync function) may execute it.
create or replace function public.apply_health_logs(p_user_id uuid, p_rows jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligible int;
  v_written int;
  v_habits int;
begin
  if p_user_id is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'apply_health_logs: invalid arguments' using errcode = '22023';
  end if;

  with input as (
    select (r ->> 'user_habit_id')::uuid as habit_id,
           (r ->> 'date')::date as day,
           (r ->> 'value')::numeric as value,
           (r ->> 'target')::numeric as target
      from jsonb_array_elements(p_rows) r
  ), eligible as (
    select distinct on (i.habit_id, i.day)
           i.habit_id, i.day, i.value, case when i.target > 0 then i.target end as target
      from input i
      join public.user_habits h on h.id = i.habit_id
     where h.user_id = p_user_id
       and h.kind = 'value'
       and h.auto_source = 'steps'
       and h.deleted_at is null
     order by i.habit_id, i.day
  ), written as (
    insert into public.habit_logs as l (user_id, user_habit_id, date, value, source, target)
    select p_user_id, e.habit_id, e.day, e.value, 'health_connect', e.target from eligible e
    on conflict (user_habit_id, date) do update
       set value = excluded.value, source = excluded.source, target = excluded.target
     where l.source <> 'manual'
    returning l.user_habit_id
  )
  -- an eligible row that was neither inserted nor updated hit a manual log
  select (select count(*) from eligible), count(*), count(distinct w.user_habit_id)
    into v_eligible, v_written, v_habits
    from written w;

  return jsonb_build_object('written', v_written, 'skippedManual', v_eligible - v_written, 'habitsUpdated', v_habits);
end $$;

-- Supabase grants execute on new public functions to anon/authenticated by default.
revoke execute on function public.apply_health_logs(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_health_logs(uuid, jsonb) to service_role;
