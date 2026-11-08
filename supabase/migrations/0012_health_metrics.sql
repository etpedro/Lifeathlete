-- Automatic data collection, phase 1b: source-independent metrics. Additive only.
--
-- Four metrics (the same keys in the health-sync function and the client):
--   steps            integer 0..100000  (daily step total)
--   workout_minutes  integer 0..1440    (total duration of workouts)
--   sleep_hours      decimal 0..24      (sleep duration, 2 decimals)
--   mindful_minutes  integer 0..1440    (mindfulness duration)
--
-- 1. user_habits.auto_source now holds a METRIC KEY (which metric fills a value habit);
--    the existing 'steps' rows stay valid. Only value habits can have one (0011).
-- 2. provider_connections.consented_categories: the metrics the user agreed to share.
--    Server-side only, like consented_at/consent_version: not in the authenticated
--    column-select grant of 0002. Rows that consented to the steps-only text (v2) get
--    '{steps}' (that text covered steps only); health-sync v2 still asks them again.
-- 3. Ingest and fill are separate (both executable by service_role only):
--    upsert_provider_activity stores a provider's daily metrics (JSON merge per day);
--    fill_habits_from_activity fills the habits from the stored metrics, taking each
--    value from the highest-priority provider that has it, and never overwrites a manual
--    log.
--    Both only ever use what the user currently consents to: a provider counts only while
--    its provider_connections row is 'connected' and the metric is in its
--    consented_categories. Stored data of a revoked category or a disconnected provider
--    is kept but never used.
-- apply_health_logs (0011) is kept untouched: the deployed health-sync v1 calls it until
-- v2 is deployed. A later cleanup migration may drop it.

alter table public.user_habits drop constraint user_habits_auto_source_known;
alter table public.user_habits
  add constraint user_habits_auto_source_known
  check (auto_source in ('steps', 'workout_minutes', 'sleep_hours', 'mindful_minutes'));

alter table public.provider_connections
  add column consented_categories text[] not null default '{}',
  add constraint provider_connections_consented_categories_known
  check (consented_categories <@ array['steps', 'workout_minutes', 'sleep_hours', 'mindful_minutes']::text[]);

update public.provider_connections
   set consented_categories = '{steps}'
 where consent_version = 'steps-2026-11-v2';

-- Per-metric upper limit and rounding (decimals). Values outside 0..max are rejected.
create or replace function public.health_metric_limits()
returns table (metric text, max_value numeric, decimals int)
language sql
immutable
set search_path = ''
as $$
  values ('steps', 100000::numeric, 0),
         ('workout_minutes', 1440::numeric, 0),
         ('sleep_hours', 24::numeric, 2),
         ('mindful_minutes', 1440::numeric, 0)
$$;

-- Stores one provider's daily metrics. p_rows = [{ "date": "YYYY-MM-DD", "metrics":
-- { "<metric>": number, ... } }, ...]. Every row is validated first (known provider,
-- real calendar date, unique dates, a non-empty metrics object with only known keys and
-- numbers within the limits): any violation raises 22023 and nothing is written. Values
-- are rounded per metric. Then, in the same transaction as the write, the provider's
-- connection row is locked (FOR SHARE) and must be 'connected' with every metric key of
-- p_rows in consented_categories; otherwise it raises SQLSTATE P0001 with the message
-- exactly 'consent_required' and nothing is written (a disconnect committed before this
-- point, or racing with it, can never let unconsented data in). An existing day is
-- MERGED (payload || new), so a sync of one metric never erases the other metrics
-- already stored for that day. Returns the number of day-rows written.
create or replace function public.upsert_provider_activity(p_user_id uuid, p_provider text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
set jit = off
as $$
declare
  r jsonb;
  m record;
  v_day date;
  v_days date[] := '{}';
  v_limit record;
  v_metrics text[] := '{}';
  v_consented text[];
  v_written int;
begin
  if p_user_id is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'upsert_provider_activity: invalid arguments' using errcode = '22023';
  end if;
  if p_provider is null or p_provider not in ('health_connect', 'huawei_health') then
    raise exception 'upsert_provider_activity: unsupported provider' using errcode = '22023';
  end if;

  for r in select e from jsonb_array_elements(p_rows) e loop
    if jsonb_typeof(r) <> 'object' or jsonb_typeof(r -> 'date') is distinct from 'string'
       or (r ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'upsert_provider_activity: invalid date' using errcode = '22023';
    end if;
    begin
      v_day := (r ->> 'date')::date;
    exception when others then
      raise exception 'upsert_provider_activity: invalid date' using errcode = '22023';
    end;
    if to_char(v_day, 'YYYY-MM-DD') <> (r ->> 'date') or v_day = any (v_days) then
      raise exception 'upsert_provider_activity: invalid or duplicate date' using errcode = '22023';
    end if;
    v_days := v_days || v_day;
    if jsonb_typeof(r -> 'metrics') is distinct from 'object' or (r -> 'metrics') = '{}'::jsonb then
      raise exception 'upsert_provider_activity: metrics required' using errcode = '22023';
    end if;
    for m in select key, value from jsonb_each(r -> 'metrics') loop
      select * into v_limit from public.health_metric_limits() l where l.metric = m.key;
      if not found or jsonb_typeof(m.value) <> 'number'
         or (m.value #>> '{}')::numeric < 0 or (m.value #>> '{}')::numeric > v_limit.max_value then
        raise exception 'upsert_provider_activity: invalid metric %', m.key using errcode = '22023';
      end if;
      v_metrics := v_metrics || m.key;
    end loop;
  end loop;

  -- consent is the authority here, atomically with the write
  select c.consented_categories into v_consented
    from public.provider_connections c
   where c.user_id = p_user_id and c.provider = p_provider and c.status = 'connected'
     for share;
  if not found or not (v_metrics <@ v_consented) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  insert into public.provider_activity (user_id, provider, date, payload)
  select p_user_id, p_provider, (e ->> 'date')::date,
         (select jsonb_object_agg(kv.key, round((kv.value #>> '{}')::numeric, l.decimals))
            from jsonb_each(e -> 'metrics') kv
            join public.health_metric_limits() l on l.metric = kv.key)
    from jsonb_array_elements(p_rows) e
  on conflict (user_id, provider, date) do update
     set payload = public.provider_activity.payload || excluded.payload;
  get diagnostics v_written = row_count;
  return v_written;
end $$;

-- Fills p_user_id's habits (value kind, auto_source set, active, not deleted; at most 50,
-- oldest first by created_at, id; the rest is reported as habitsIgnored) for every day
-- of [p_from, p_to] (at most 8 days, else 22023) from provider_activity.
--
-- SOURCE PRIORITY (default, highest first):
--   health_connect, apple_health, huawei_health, fitbit, garmin, oura, strava
-- For each habit and day the value comes from the highest-priority provider that is
-- CONNECTED with that metric in its consented_categories and whose stored payload has
-- that metric as a number within the metric's limits that day; providers outside this
-- list, disconnected providers, providers without a connection row and revoked
-- categories never fill a habit (already written logs are left alone); with no provider, nothing is done for that
-- habit/day. The log gets source = that provider, the value and the habit's target
-- when finite > 0 (else null). One statement: a MANUAL log always prevails; an automatic
-- log is replaced (higher-priority or newer value). Idempotent. Returns
-- { written, skippedManual, habitsUpdated, habitsIgnored }.
create or replace function public.fill_habits_from_activity(p_user_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
set jit = off
as $$
declare
  c_priority constant text[] := array['health_connect', 'apple_health', 'huawei_health', 'fitbit', 'garmin', 'oura', 'strava'];
  c_max_habits constant int := 50;
  c_max_days constant int := 8;
  v_total int;
  v_eligible int;
  v_written int;
  v_habits int;
begin
  if p_user_id is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from + 1 > c_max_days then
    raise exception 'fill_habits_from_activity: invalid arguments' using errcode = '22023';
  end if;

  select count(*) into v_total
    from public.user_habits h
   where h.user_id = p_user_id and h.kind = 'value' and h.auto_source is not null
     and h.active and h.deleted_at is null;

  with habits as (
    select h.id, h.auto_source as metric,
           case when h.target > 0 and h.target < 'Infinity'::numeric then h.target end as target
      from public.user_habits h
     where h.user_id = p_user_id and h.kind = 'value' and h.auto_source is not null
       and h.active and h.deleted_at is null
     order by h.created_at, h.id
     limit c_max_habits
  ), chosen as (
    select h.id as habit_id, d.day::date as day, h.target, best.provider, best.value
      from habits h
     cross join generate_series(p_from, p_to, interval '1 day') d(day)
     cross join lateral (
       select v.provider, v.value
         from (
           -- the cast only runs on JSON numbers (WHERE order is not guaranteed)
           select a.provider,
                  case when jsonb_typeof(a.payload -> h.metric) = 'number'
                       then (a.payload ->> h.metric)::numeric end as value
             from public.provider_activity a
             join public.provider_connections pc
               on pc.user_id = a.user_id and pc.provider = a.provider
              and pc.status = 'connected' and h.metric = any (pc.consented_categories)
            where a.user_id = p_user_id
              and a.date = d.day::date
              and a.provider = any (c_priority)
         ) v
         join public.health_metric_limits() l on l.metric = h.metric
        where v.value between 0 and l.max_value
        order by array_position(c_priority, v.provider)
        limit 1
     ) best
  ), written as (
    insert into public.habit_logs (user_id, user_habit_id, date, value, source, target)
    select p_user_id, c.habit_id, c.day, c.value, c.provider, c.target from chosen c
    on conflict (user_habit_id, date) do update
       set value = excluded.value, source = excluded.source, target = excluded.target
     where public.habit_logs.source <> 'manual'
    returning public.habit_logs.user_habit_id
  )
  -- a chosen row that was neither inserted nor updated hit a manual log
  select (select count(*) from chosen), count(*), count(distinct w.user_habit_id)
    into v_eligible, v_written, v_habits
    from written w;

  return jsonb_build_object(
    'written', v_written,
    'skippedManual', v_eligible - v_written,
    'habitsUpdated', v_habits,
    'habitsIgnored', greatest(v_total - c_max_habits, 0));
end $$;

-- Supabase grants execute on new public functions to anon/authenticated by default.
revoke execute on function public.health_metric_limits() from public, anon, authenticated;
grant execute on function public.health_metric_limits() to service_role;
revoke execute on function public.upsert_provider_activity(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_provider_activity(uuid, text, jsonb) to service_role;
revoke execute on function public.fill_habits_from_activity(uuid, date, date) from public, anon, authenticated;
grant execute on function public.fill_habits_from_activity(uuid, date, date) to service_role;
