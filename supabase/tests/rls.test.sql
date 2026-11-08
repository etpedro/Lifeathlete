-- Plain-SQL tests (no pgTAP). Any failed assert / unexpected result aborts with a non-zero exit.
\set ON_ERROR_STOP on

-- ---------- fixtures (as superuser) ----------
insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b');

insert into public.profiles(user_id, locale, timezone, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','pt','Europe/Lisbon','A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','en','UTC','B');

insert into public.user_habits(id, user_id, pillar_id, title, kind, target)
select 'a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', id, 'A habit', 'check', 1
  from public.pillars where slug = 'exercise';
insert into public.user_habits(id, user_id, pillar_id, title, kind, target)
select 'b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', id, 'B habit', 'check', 1
  from public.pillars where slug = 'exercise';
insert into public.habit_logs(user_id, user_habit_id, date, value) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','a1a1a1a1-0000-0000-0000-000000000001','2026-01-01',1),
  ('bbbbbbbb-0000-0000-0000-00000000000b','b1b1b1b1-0000-0000-0000-000000000001','2026-01-01',1);
insert into public.provider_connections(user_id, provider, access_token_enc, refresh_token_enc, status)
  values ('aaaaaaaa-0000-0000-0000-00000000000a','strava','SECRET-ACCESS','SECRET-REFRESH','connected');
insert into public.provider_activity(user_id, provider, date, payload)
  values ('bbbbbbbb-0000-0000-0000-00000000000b','strava','2026-01-01','{}');
insert into public.user_stats(user_id) values ('aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.achievements(code, xp_reward) values ('test_ach', 10);

-- helper: expect an error (any insufficient_privilege / RLS / constraint) for a statement
create function pg_temp.fails(stmt text, expected_state text default null) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return expected_state is null or sqlstate = expected_state;
end $$;
grant execute on function pg_temp.fails(text, text) to public;

-- helper: the caller's profile-local today + k days (the habit_logs client date window, 0009)
create function pg_temp.d(k int) returns date language sql stable as $$
  select public.safe_local_date((select p.timezone from public.profiles p where p.user_id = auth.uid())) + k
$$;
grant execute on function pg_temp.d(int) to public;

-- ---------- safe_local_date (0008): invalid or missing timezone falls back to UTC ----------
do $$
begin
  assert public.safe_local_date('UTC') = (now() at time zone 'UTC')::date, 'UTC local date';
  assert public.safe_local_date('Pacific/Kiritimati') = (now() at time zone 'Pacific/Kiritimati')::date, 'named zone';
  assert public.safe_local_date('Not/AZone') = (now() at time zone 'UTC')::date, 'invalid zone -> UTC';
  assert public.safe_local_date(null) = (now() at time zone 'UTC')::date, 'null zone -> UTC';
  assert public.safe_local_date('') = (now() at time zone 'UTC')::date, 'empty zone -> UTC';
end $$;

-- ---------- catalog / seed (superuser) ----------
do $$
declare bad int;
begin
  assert (select count(*) from public.pillars) = 10, 'expected 10 pillars';
  assert (select array_agg(slug order by sort) from public.pillars) = array[
    'exercise','nutrition','nature','gratitude','screens','lightness','meditation','active-lifestyle','reading','family'],
    'pillar slugs/order mismatch';
  select count(*) into bad from public.pillars p
   where (select count(*) from public.habit_templates t where t.pillar_id = p.id) not between 2 and 4;
  assert bad = 0, 'every pillar needs 2..4 templates, violations: ' || bad;
  select count(*) into bad from public.pillars p
   where (select count(distinct locale) from public.pillar_i18n i where i.pillar_id = p.id and i.locale in ('pt','en')) <> 2;
  assert bad = 0, 'every pillar needs pt+en i18n';
  select count(*) into bad from public.habit_templates t
   where (select count(distinct locale) from public.habit_templates_i18n i where i.template_id = t.id and i.locale in ('pt','en')) <> 2;
  assert bad = 0, 'every template needs pt+en i18n';
  assert (select name from public.pillar_i18n i join public.pillars p on p.id = i.pillar_id
           where p.slug = 'family' and i.locale = 'pt') = 'Família e valores', 'family PT name';
  assert (select i.title from public.habit_templates_i18n i join public.habit_templates t on t.id = i.template_id
           join public.pillars p on p.id = t.pillar_id where p.slug = 'meditation' and t.default_target = 10 and i.locale = 'pt') = 'Meditar 10 min',
    'meditation PT template';
  assert (select kind from public.habit_templates t join public.habit_templates_i18n i on i.template_id = t.id
           where i.title = 'Menos de 2h de ecrã') = 'check', 'screens template is check';
  -- achievement seed (0004): 6 codes, pt+en i18n, rule JSON uses pillar SLUGS (ruling L)
  assert (select array_agg(code order by code) from public.achievements where code <> 'test_ach') = array[
    'balance_week_10','streak_exercise_30','streak_global_100','streak_meditation_30','streak_reading_30','total_100'],
    'expected the 6 seeded achievements';
  select count(*) into bad from public.achievements a
   where a.code <> 'test_ach'
     and (select count(distinct locale) from public.achievements_i18n i where i.achievement_id = a.id and i.locale in ('pt','en')) <> 2;
  assert bad = 0, 'every seeded achievement needs pt+en i18n';
  assert (select rule from public.achievements where code = 'streak_meditation_30') = '{"type":"streak","days":30,"pillar":"meditation"}'::jsonb,
    'streak_meditation_30 rule';
  assert (select rule from public.achievements where code = 'streak_reading_30') = '{"type":"streak","days":30,"pillar":"reading"}'::jsonb,
    'streak_reading_30 rule';
  assert (select rule from public.achievements where code = 'streak_exercise_30') = '{"type":"streak","days":30,"pillar":"exercise"}'::jsonb,
    'streak_exercise_30 rule';
  assert (select rule from public.achievements where code = 'streak_global_100') = '{"type":"streak","days":100}'::jsonb,
    'streak_global_100 rule';
  assert (select rule from public.achievements where code = 'balance_week_10') = '{"type":"balance","pillars":10}'::jsonb,
    'balance_week_10 rule';
  assert (select rule from public.achievements where code = 'total_100') = '{"type":"total","count":100}'::jsonb,
    'total_100 rule';
  -- pillar_id column agrees with the rule's pillar slug; global rules have null pillar_id
  select count(*) into bad from public.achievements a left join public.pillars p on p.id = a.pillar_id
   where a.code <> 'test_ach' and (a.rule ->> 'pillar') is distinct from p.slug;
  assert bad = 0, 'achievements.pillar_id must match rule.pillar slug';
  assert (select name from public.achievements_i18n i join public.achievements a on a.id = i.achievement_id
           where a.code = 'total_100' and i.locale = 'pt') is not null, 'total_100 PT name';
  assert pg_temp.fails($f$insert into public.habit_templates(pillar_id, slug, kind) select id, 'x', 'bogus' from public.pillars limit 1$f$, '23514'),
    'invalid template kind must violate check';
end $$;

-- ---------- user A ----------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';

do $$
declare n int;
begin
  -- isolation
  assert (select count(*) from public.user_habits) = 1, 'A sees exactly own habit';
  assert (select count(*) from public.user_habits where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0, 'A cannot see B habits';
  assert (select count(*) from public.habit_logs where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0, 'A cannot see B logs';
  assert (select count(*) from public.profiles) = 1, 'A sees only own profile';
  assert (select count(*) from public.profiles where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 0, 'A cannot see B profile';
  assert (select count(*) from public.provider_activity) = 0, 'A cannot see B provider_activity';

  -- own insert/select/update
  insert into public.user_habits(user_id, pillar_id, title, kind, target)
    select auth.uid(), id, 'Mine', 'value', 10 from public.pillars where slug = 'meditation';
  assert (select count(*) from public.user_habits) = 2, 'A inserted own habit';
  insert into public.habit_logs(user_id, user_habit_id, date, value)
    values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', pg_temp.d(0), 1);
  update public.profiles set display_name = 'A2' where user_id = auth.uid();
  assert (select display_name from public.profiles) = 'A2', 'A updated own profile';

  -- habit_logs hardening (0005, ruling F): non-negative value, client may only write source 'manual'
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', pg_temp.d(-1), -1)$f$, '23514'),
    'negative habit_logs.value must violate check';
  assert pg_temp.fails($f$update public.habit_logs set value = -5 where date = pg_temp.d(0)$f$, '23514'),
    'updating habit_logs.value to negative must violate check';
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value, source)
      values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', pg_temp.d(-2), 1, 'strava')$f$, '42501'),
    'authenticated insert with source strava must be denied';
  assert pg_temp.fails($f$update public.habit_logs set source = 'strava' where date = pg_temp.d(0)$f$, '42501'),
    'authenticated update setting source to strava must be denied';
  assert (select source from public.habit_logs where date = pg_temp.d(0)) = 'manual', 'source unchanged after denied update';
  update public.habit_logs set value = 0 where date = pg_temp.d(0);
  get diagnostics n = row_count;
  assert n = 1, 'A can still update own manual log (value 0 allowed, un-tick)';
  update public.habit_logs set value = 1, source = 'manual' where date = pg_temp.d(0);
  get diagnostics n = row_count;
  assert n = 1, 'A can still update own manual log back to 1';
  assert pg_temp.fails($f$delete from public.habit_logs where date = pg_temp.d(0)$f$, '42501'),
    'A still cannot delete logs (no delete grant)';

  -- cannot touch B's rows
  update public.user_habits set title = 'hacked' where id = 'b1b1b1b1-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot update B habit';
  update public.profiles set display_name = 'hacked' where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot update B profile';
  assert pg_temp.fails($f$insert into public.user_habits(user_id, pillar_id, title, kind)
      select 'bbbbbbbb-0000-0000-0000-00000000000b', id, 'x', 'check' from public.pillars limit 1$f$),
    'A cannot insert habit for B';

  -- habit_logs: another user's habit is rejected, even with own user_id or B's user_id
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values (auth.uid(), 'b1b1b1b1-0000-0000-0000-000000000001', '2026-02-01', 1)$f$),
    'A cannot log on B habit (own user_id)';
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values ('bbbbbbbb-0000-0000-0000-00000000000b', 'b1b1b1b1-0000-0000-0000-000000000001', '2026-02-01', 1)$f$),
    'A cannot log on B habit (B user_id)';
  assert pg_temp.fails($f$update public.habit_logs set user_habit_id = 'b1b1b1b1-0000-0000-0000-000000000001'
      where date = pg_temp.d(0)$f$),
    'A cannot re-point a log to B habit';

  -- target snapshot (0007): the client writes the habit's target with the log; it must be > 0 or null
  update public.habit_logs set target = 1 where date = pg_temp.d(0);
  assert (select target from public.habit_logs where date = pg_temp.d(0)) = 1, 'A stores a target snapshot';
  update public.habit_logs set target = null where date = pg_temp.d(0);
  get diagnostics n = row_count;
  assert n = 1, 'a null snapshot is allowed (provider/legacy rows)';
  assert pg_temp.fails($f$update public.habit_logs set target = 0 where date = pg_temp.d(0)$f$, '23514'),
    'a zero target snapshot must violate the check';
  assert pg_temp.fails($f$update public.habit_logs set target = -1 where date = pg_temp.d(0)$f$, '23514'),
    'a negative target snapshot must violate the check';

  -- pause intervals (0008): a jsonb array, default empty, written by the client with `active`
  assert (select pauses from public.user_habits where id = 'a1a1a1a1-0000-0000-0000-000000000001') = '[]'::jsonb,
    'pauses defaults to an empty array';
  update public.user_habits set active = false, pauses = '[{"from":"2026-01-03","to":null}]'
   where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, 'A can record a pause interval';
  update public.user_habits set active = true, pauses = '[]' where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  assert pg_temp.fails($f$update public.user_habits set pauses = '{}' where id = 'a1a1a1a1-0000-0000-0000-000000000001'$f$, '23514'),
    'pauses must be a json array';

  -- client date window (0009, F10): manual logs only for [local today - 3, local today + 1]
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', pg_temp.d(-10), 1)$f$, '42501'),
    'a manual log 10 days ago must be denied';
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', pg_temp.d(10), 1)$f$, '42501'),
    'a manual log 10 days ahead must be denied';
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', pg_temp.d(-4), 1)$f$, '42501'),
    'today - 4 is outside the window';
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', pg_temp.d(2), 1)$f$, '42501'),
    'today + 2 is outside the window';
  assert pg_temp.fails($f$update public.habit_logs set date = pg_temp.d(-10) where date = pg_temp.d(0)$f$, '42501'),
    'moving a log out of the window must be denied';
  insert into public.habit_logs(user_id, user_habit_id, date, value)
    select auth.uid(), id, d, 1 from public.user_habits, unnest(array[pg_temp.d(-1), pg_temp.d(-3), pg_temp.d(1)]) d
     where title = 'Mine';
  get diagnostics n = row_count;
  assert n = 3, 'yesterday, today - 3 and today + 1 (timezone edge) are allowed';
  -- an old row outside the window (here the 2026-01-01 fixture) cannot be rewritten by the client
  assert pg_temp.fails($f$update public.habit_logs set value = 0 where date = '2026-01-01'$f$, '42501'),
    'an old log cannot be edited by the client';

  -- unique (user_habit_id, date)
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', pg_temp.d(0), 1)$f$, '23505'),
    'duplicate (user_habit_id,date) must violate unique';

  -- server-written tables: read-only for the client
  assert (select count(*) from public.user_stats) = 1, 'A can read own user_stats';
  assert pg_temp.fails($f$insert into public.user_stats(user_id) values (auth.uid())$f$), 'A cannot insert user_stats';
  assert pg_temp.fails($f$update public.user_stats set xp_total = 999999$f$), 'A cannot update user_stats';
  assert pg_temp.fails($f$update public.user_stats set computed_for = '2099-01-01'$f$, '42501'),
    'A cannot mark its stats as fresh';
  assert pg_temp.fails($f$delete from public.user_stats$f$), 'A cannot delete user_stats';
  assert pg_temp.fails($f$insert into public.pillar_scores(user_id, pillar_id, score)
      select auth.uid(), id, 100 from public.pillars limit 1$f$), 'A cannot insert pillar_scores';
  assert pg_temp.fails($f$update public.pillar_scores set score = 100$f$), 'A cannot update pillar_scores';
  assert pg_temp.fails($f$insert into public.user_achievements(user_id, achievement_id)
      select auth.uid(), id from public.achievements limit 1$f$), 'A cannot insert user_achievements';
  assert pg_temp.fails($f$update public.user_achievements set unlocked_at = now()$f$), 'A cannot update user_achievements';
  assert pg_temp.fails($f$insert into public.mascot_state(user_id) values (auth.uid())$f$), 'A cannot insert mascot_state';
  assert pg_temp.fails($f$update public.mascot_state set stage = 5$f$), 'A cannot update mascot_state';

  -- catalog readable, not writable
  assert (select count(*) from public.pillars) = 10, 'A reads pillars';
  assert (select count(*) from public.pillar_i18n) = 20, 'A reads pillar_i18n';
  assert (select count(*) from public.habit_templates) >= 20, 'A reads habit_templates';
  assert (select count(*) from public.habit_templates_i18n) >= 40, 'A reads habit_templates_i18n';
  assert (select count(*) from public.achievements) = 7, 'A reads achievements (6 seeded + test_ach)';
  perform 1 from public.achievements_i18n;
  assert pg_temp.fails($f$insert into public.pillars(slug, icon, color, sort) values ('z','z','#000',99)$f$), 'A cannot insert pillars';
  assert pg_temp.fails($f$update public.pillars set color = '#000'$f$), 'A cannot update pillars';
  assert pg_temp.fails($f$delete from public.pillars$f$), 'A cannot delete pillars';
  assert pg_temp.fails($f$update public.pillar_i18n set name = 'x'$f$), 'A cannot update pillar_i18n';
  assert pg_temp.fails($f$update public.habit_templates set unit = 'x'$f$), 'A cannot update habit_templates';
  assert pg_temp.fails($f$update public.habit_templates_i18n set title = 'x'$f$), 'A cannot update habit_templates_i18n';
  assert pg_temp.fails($f$update public.achievements set xp_reward = 1$f$), 'A cannot update achievements';
  assert pg_temp.fails($f$insert into public.achievements_i18n(achievement_id, locale, name) select id, 'pt', 'x' from public.achievements$f$),
    'A cannot insert achievements_i18n';

  -- provider tokens
  assert (select count(*) from public.provider_connections) = 1, 'A sees own connection';
  perform provider, status, last_synced_at from public.provider_connections;
  assert pg_temp.fails($f$select access_token_enc from public.provider_connections$f$, '42501'), 'A cannot read access token';
  assert pg_temp.fails($f$select refresh_token_enc from public.provider_connections$f$, '42501'), 'A cannot read refresh token';
  assert pg_temp.fails($f$select * from public.provider_connections$f$, '42501'), 'select * must not expose tokens';
  assert pg_temp.fails($f$insert into public.provider_connections(user_id, provider) values (auth.uid(), 'fitbit')$f$),
    'A cannot insert provider_connections';
  assert pg_temp.fails($f$update public.provider_connections set status = 'x'$f$), 'A cannot update provider_connections';
  assert pg_temp.fails($f$insert into public.provider_activity(user_id, provider, date) values (auth.uid(), 'strava', '2026-01-01')$f$),
    'A cannot insert provider_activity';

  -- soft delete keeps logs; hard delete of habits not allowed for clients
  assert pg_temp.fails($f$delete from public.user_habits where id = 'a1a1a1a1-0000-0000-0000-000000000001'$f$),
    'A cannot hard-delete habits';
  update public.user_habits set deleted_at = now(), active = false where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  assert (select count(*) from public.habit_logs where user_habit_id = 'a1a1a1a1-0000-0000-0000-000000000001') = 2,
    'soft-deleting a habit keeps its logs';

  -- one active habit per (user, template) (0006, onboarding idempotency)
  insert into public.user_habits(user_id, template_id, pillar_id, title, kind)
    select auth.uid(), t.id, t.pillar_id, 'Tpl', t.kind from public.habit_templates t where t.slug = 'workout';
  assert pg_temp.fails($f$insert into public.user_habits(user_id, template_id, pillar_id, title, kind)
      select auth.uid(), t.id, t.pillar_id, 'Tpl again', t.kind from public.habit_templates t where t.slug = 'workout'$f$, '23505'),
    'duplicate active (user_id, template_id) must violate unique';
  insert into public.user_habits(user_id, pillar_id, title, kind)
    select auth.uid(), id, 'Custom', 'check' from public.pillars where slug = 'reading';
  insert into public.user_habits(user_id, pillar_id, title, kind)
    select auth.uid(), id, 'Custom', 'check' from public.pillars where slug = 'reading';
  assert (select count(*) from public.user_habits where title = 'Custom' and template_id is null) = 2,
    'custom habits (template_id null) are not constrained';
  update public.user_habits set deleted_at = now(), active = false
   where template_id = (select id from public.habit_templates where slug = 'workout');
  insert into public.user_habits(user_id, template_id, pillar_id, title, kind)
    select auth.uid(), t.id, t.pillar_id, 'Tpl re-added', t.kind from public.habit_templates t where t.slug = 'workout';
  assert (select count(*) from public.user_habits
           where template_id = (select id from public.habit_templates where slug = 'workout')) = 2,
    'a template can be re-added after its habit is soft-deleted';
  -- the index is partial, so ON CONFLICT (user_id, template_id) cannot infer it (42P10);
  -- this is why the data layer does select-then-insert instead of a PostgREST upsert
  assert pg_temp.fails($f$insert into public.user_habits(user_id, template_id, pillar_id, title, kind)
      select auth.uid(), t.id, t.pillar_id, 'x', t.kind from public.habit_templates t where t.slug = 'workout'
      on conflict (user_id, template_id) do nothing$f$, '42P10'),
    'partial unique index is not usable as an ON CONFLICT target without its predicate';
end $$;

-- ---------- user B sees nothing of A ----------
reset role;
update public.profiles set timezone = 'Not/AZone' where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
do $$
begin
  assert (select count(*) from public.user_habits) = 1, 'B sees only own habit';
  assert (select count(*) from public.habit_logs) = 1, 'B sees only own logs';
  assert (select count(*) from public.profiles) = 1, 'B sees only own profile';
  assert (select count(*) from public.user_stats) = 0, 'B cannot see A stats';
  assert (select count(*) from public.provider_connections) = 0, 'B cannot see A connections';
  assert (select count(*) from public.provider_activity) = 1, 'B sees own provider_activity';
  -- window with an invalid profile timezone: UTC today is used
  insert into public.habit_logs(user_id, user_habit_id, date, value)
    values (auth.uid(), 'b1b1b1b1-0000-0000-0000-000000000001', (now() at time zone 'UTC')::date, 1);
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values (auth.uid(), 'b1b1b1b1-0000-0000-0000-000000000001', (now() at time zone 'UTC')::date - 10, 1)$f$, '42501'),
    'invalid timezone: the UTC window still applies';
end $$;

-- ---------- health sync (0011): automatic steps ----------
-- B gets a value habit (as superuser) so A can try to write another user's value habit.
reset role;
insert into public.user_habits(id, user_id, pillar_id, title, kind, target)
select 'b2b2b2b2-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b', id, 'B steps', 'value', 8000
  from public.pillars where slug = 'active-lifestyle';
update public.provider_connections set consented_at = now() where provider = 'strava';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
do $$
declare n int;
begin
  -- server-written integration tables: no client insert / update / delete
  assert pg_temp.fails($f$insert into public.provider_activity(user_id, provider, date, payload)
      values (auth.uid(), 'health_connect', pg_temp.d(0), '{"steps":1}')$f$, '42501'),
    'A cannot insert provider_activity (health_connect)';
  assert pg_temp.fails($f$update public.provider_activity set payload = '{"steps":99999}'$f$, '42501'),
    'A cannot update provider_activity';
  assert pg_temp.fails($f$delete from public.provider_activity$f$, '42501'), 'A cannot delete provider_activity';
  assert pg_temp.fails($f$insert into public.provider_connections(user_id, provider, status)
      values (auth.uid(), 'health_connect', 'connected')$f$, '42501'),
    'A cannot insert a health_connect connection';
  assert pg_temp.fails($f$update public.provider_connections set consented_at = now()$f$, '42501'),
    'A cannot grant itself consent';
  assert pg_temp.fails($f$update public.provider_connections set last_synced_at = now()$f$, '42501'),
    'A cannot update last_synced_at';
  assert pg_temp.fails($f$delete from public.provider_connections$f$, '42501'), 'A cannot delete provider_connections';
  -- the column grant still exposes status columns only
  perform id, user_id, provider, status, last_synced_at from public.provider_connections;
  assert pg_temp.fails($f$select consented_at from public.provider_connections$f$, '42501'), 'A cannot read consented_at';
  assert pg_temp.fails($f$select consent_version from public.provider_connections$f$, '42501'), 'A cannot read consent_version';
  assert pg_temp.fails($f$select consent_withdrawn_at from public.provider_connections$f$, '42501'),
    'A cannot read consent_withdrawn_at';
  assert pg_temp.fails($f$select * from public.provider_connections$f$, '42501'), 'select * still denied';
  assert pg_temp.fails($f$update public.provider_connections set consent_version = 'x'$f$, '42501'),
    'A cannot write consent_version';
  assert pg_temp.fails($f$update public.provider_connections set consent_withdrawn_at = null$f$, '42501'),
    'A cannot write consent_withdrawn_at';
  assert pg_temp.fails($f$select expires_at from public.provider_connections$f$, '42501'), 'A cannot read expires_at';
  assert pg_temp.fails($f$select access_token_enc, refresh_token_enc from public.provider_connections$f$, '42501'),
    'A still cannot read the token columns';
  -- the client cannot write automatic logs
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value, source)
      select auth.uid(), id, pg_temp.d(0), 5000, 'health_connect' from public.user_habits where title = 'Mine'$f$, '42501'),
    'A cannot insert a health_connect log';

  -- auto_source on own habits
  assert (select auto_source from public.user_habits where title = 'Mine') is null, 'auto_source defaults to null';
  update public.user_habits set auto_source = 'steps' where title = 'Mine';
  get diagnostics n = row_count;
  assert n = 1, 'A can set auto_source = steps on its own value habit';
  assert (select auto_source from public.user_habits where title = 'Mine') = 'steps', 'auto_source stored';
  assert pg_temp.fails($f$update public.user_habits set kind = 'check' where title = 'Mine'$f$, '23514'),
    'a steps habit cannot become a check habit';
  update public.user_habits set auto_source = null where title = 'Mine';
  get diagnostics n = row_count;
  assert n = 1, 'A can clear auto_source';
  insert into public.user_habits(user_id, pillar_id, title, kind, target)
    select auth.uid(), id, 'Check 0011', 'check', 1 from public.pillars where slug = 'nature';
  assert pg_temp.fails($f$update public.user_habits set auto_source = 'steps' where title = 'Check 0011'$f$, '23514'),
    'auto_source on a check habit must violate the check';
  assert pg_temp.fails($f$insert into public.user_habits(user_id, pillar_id, title, kind, auto_source)
      select auth.uid(), id, 'Bad', 'check', 'steps' from public.pillars where slug = 'nature'$f$, '23514'),
    'inserting a check habit with auto_source must violate the check';
  assert pg_temp.fails($f$update public.user_habits set auto_source = 'calories' where title = 'Mine'$f$, '23514'),
    'an unknown auto_source must violate the check';
  update public.user_habits set auto_source = 'steps' where id = 'b2b2b2b2-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot set auto_source on B value habit';
end $$;

reset role;
do $$
begin
  assert (select auto_source from public.user_habits where id = 'b2b2b2b2-0000-0000-0000-000000000002') is null,
    'B habit unchanged';
end $$;

-- service_role (the health-sync function) writes automatic logs and provider rows
set role service_role;
do $$
begin
  insert into public.provider_connections(user_id, provider, status, consented_at, consent_version)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'health_connect', 'connected', now(), 'v-test');
  update public.provider_connections set consent_withdrawn_at = now(), status = 'disconnected'
   where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and provider = 'health_connect';
  update public.provider_connections set consent_withdrawn_at = null, status = 'connected'
   where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and provider = 'health_connect';
  assert (select consent_version from public.provider_connections
           where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and provider = 'health_connect') = 'v-test',
    'service_role records the consent version';
  update public.provider_connections set last_synced_at = now()
   where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and provider = 'health_connect';
  assert (select consented_at from public.provider_connections
           where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and provider = 'health_connect') is not null,
    'service_role records consent';
  update public.user_habits set auto_source = 'steps' where id = 'b2b2b2b2-0000-0000-0000-000000000002';
  insert into public.provider_activity(user_id, provider, date, payload)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'health_connect', '2026-11-01', '{"steps":6543}');
  insert into public.habit_logs(user_id, user_habit_id, date, value, source, target)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'b2b2b2b2-0000-0000-0000-000000000002', '2026-11-01', 6543,
            'health_connect', 8000);
  assert (select source from public.habit_logs where user_habit_id = 'b2b2b2b2-0000-0000-0000-000000000002'
            and date = '2026-11-01') = 'health_connect', 'service_role wrote an automatic log';
  assert pg_temp.fails($f$insert into public.provider_activity(user_id, provider, date, payload)
      values ('bbbbbbbb-0000-0000-0000-00000000000b', 'health_connect', '2026-11-01', '{"steps":1}')$f$, '23505'),
    'a duplicate (user_id, provider, date) must violate unique';
  assert pg_temp.fails($f$insert into public.provider_connections(user_id, provider, status)
      values ('bbbbbbbb-0000-0000-0000-00000000000b', 'health_connect', 'connected')$f$, '23505'),
    'one connection per (user_id, provider)';
end $$;

-- B reads its own status columns (not consented_at) and its own steps
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
do $$
begin
  assert (select status from public.provider_connections where provider = 'health_connect') = 'connected',
    'B reads its connection status';
  assert (select count(*) from public.provider_activity where provider = 'health_connect') = 1, 'B reads its steps';
  assert pg_temp.fails($f$select consented_at from public.provider_connections$f$, '42501'), 'B cannot read consented_at';
  assert pg_temp.fails($f$select consent_version, consent_withdrawn_at from public.provider_connections$f$, '42501'),
    'B cannot read the consent record';
  -- the atomic log writer is for the health-sync function only
  assert pg_temp.fails($f$select public.apply_health_logs(auth.uid(), '[]'::jsonb)$f$, '42501'),
    'authenticated cannot execute apply_health_logs';
end $$;

reset role;
set role anon;
do $$
begin
  assert pg_temp.fails($f$select public.apply_health_logs('bbbbbbbb-0000-0000-0000-00000000000b', '[]'::jsonb)$f$, '42501'),
    'anon cannot execute apply_health_logs';
end $$;

-- apply_health_logs (0011): one atomic statement, manual logs always prevail
reset role;
insert into public.habit_logs(user_id, user_habit_id, date, value, source)
  values ('bbbbbbbb-0000-0000-0000-00000000000b', 'b2b2b2b2-0000-0000-0000-000000000002', '2026-11-02', 42, 'manual');
insert into public.user_habits(id, user_id, pillar_id, title, kind, target, auto_source, deleted_at, active)
select 'b3b3b3b3-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-00000000000b', id, 'B deleted steps', 'value', 5000,
       'steps', now(), false
  from public.pillars where slug = 'active-lifestyle';
insert into public.user_habits(id, user_id, pillar_id, title, kind, target)
select 'b4b4b4b4-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-00000000000b', id, 'B plain value', 'value', 5000
  from public.pillars where slug = 'active-lifestyle';
create function pg_temp.health_rows() returns jsonb language sql stable as $$
  select jsonb_build_array(
    jsonb_build_object('user_habit_id', 'b2b2b2b2-0000-0000-0000-000000000002', 'date', '2026-11-01', 'value', 7000, 'target', 8000),
    jsonb_build_object('user_habit_id', 'b2b2b2b2-0000-0000-0000-000000000002', 'date', '2026-11-02', 'value', 7000, 'target', 8000),
    jsonb_build_object('user_habit_id', 'b2b2b2b2-0000-0000-0000-000000000002', 'date', '2026-11-03', 'value', 3000, 'target', null),
    jsonb_build_object('user_habit_id', (select id from public.user_habits where title = 'Mine'), 'date', '2026-11-03', 'value', 1, 'target', null),
    jsonb_build_object('user_habit_id', 'b1b1b1b1-0000-0000-0000-000000000001', 'date', '2026-11-03', 'value', 1, 'target', null),
    jsonb_build_object('user_habit_id', 'b3b3b3b3-0000-0000-0000-000000000003', 'date', '2026-11-03', 'value', 1, 'target', null),
    jsonb_build_object('user_habit_id', 'b4b4b4b4-0000-0000-0000-000000000004', 'date', '2026-11-03', 'value', 1, 'target', null))
$$;
grant execute on function pg_temp.health_rows() to public;
create function pg_temp.health_snapshot() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('h', user_habit_id, 'd', date, 'v', value, 's', source, 't', target)
                  order by user_habit_id, date), '[]'::jsonb)
    from public.habit_logs where date between '2026-11-01' and '2026-11-03'
$$;
grant execute on function pg_temp.health_snapshot() to public;
set role service_role;
do $$
declare res jsonb; snap jsonb;
begin
  res := public.apply_health_logs('bbbbbbbb-0000-0000-0000-00000000000b', pg_temp.health_rows());
  assert res = '{"written": 2, "skippedManual": 1, "habitsUpdated": 1}'::jsonb, 'counts: ' || res::text;
  assert (select value from public.habit_logs where user_habit_id = 'b2b2b2b2-0000-0000-0000-000000000002'
            and date = '2026-11-01') = 7000, 'an automatic log is replaced';
  assert (select value || '/' || source from public.habit_logs where user_habit_id = 'b2b2b2b2-0000-0000-0000-000000000002'
            and date = '2026-11-02') = '42/manual', 'a manual log is never overwritten';
  assert (select source || '/' || coalesce(target::text, 'null') || '/' || user_id from public.habit_logs
           where user_habit_id = 'b2b2b2b2-0000-0000-0000-000000000002' and date = '2026-11-03')
         = 'health_connect/null/bbbbbbbb-0000-0000-0000-00000000000b', 'a new automatic log is inserted for p_user_id';
  assert (select count(*) from public.habit_logs where date = '2026-11-03'
            and user_habit_id <> 'b2b2b2b2-0000-0000-0000-000000000002') = 0,
    'another user''s habit, a check habit, a deleted habit and a habit without auto_source are ignored';
  snap := pg_temp.health_snapshot();
  res := public.apply_health_logs('bbbbbbbb-0000-0000-0000-00000000000b', pg_temp.health_rows());
  assert res = '{"written": 2, "skippedManual": 1, "habitsUpdated": 1}'::jsonb, 'same counts on a retry: ' || res::text;
  assert pg_temp.health_snapshot() = snap, 'apply_health_logs is idempotent';
  -- the other user's id with B's rows writes nothing (and reveals nothing)
  res := public.apply_health_logs('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.health_rows());
  assert res = '{"written": 0, "skippedManual": 0, "habitsUpdated": 0}'::jsonb, 'foreign habits: ' || res::text;
  assert pg_temp.health_snapshot() = snap, 'nothing written for a foreign user id';
  assert public.apply_health_logs('bbbbbbbb-0000-0000-0000-00000000000b', '[]'::jsonb)
         = '{"written": 0, "skippedManual": 0, "habitsUpdated": 0}'::jsonb, 'empty batch';
end $$;

-- ---------- automatic data collection (0012): metrics, consent categories, ingest + fill ----------
-- The client: any of the four metrics on its own value habit; nothing else.
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
do $$
declare n int; m text;
begin
  foreach m in array array['steps','workout_minutes','sleep_hours','mindful_minutes'] loop
    update public.user_habits set auto_source = m where title = 'Mine';
    get diagnostics n = row_count;
    assert n = 1, 'A can fill its own value habit from ' || m;
    assert (select auto_source from public.user_habits where title = 'Mine') = m, m || ' stored';
  end loop;
  update public.user_habits set auto_source = null where title = 'Mine';
  assert pg_temp.fails($f$update public.user_habits set auto_source = 'sleep_hours' where title = 'Check 0011'$f$, '23514'),
    'a metric on a check habit must violate the check';
  assert pg_temp.fails($f$update public.user_habits set auto_source = 'calories' where title = 'Mine'$f$, '23514'),
    'an unknown metric must violate the check';
  assert pg_temp.fails($f$update public.user_habits set auto_source = 'Steps' where title = 'Mine'$f$, '23514'),
    'metric keys are exact';
  update public.user_habits set auto_source = 'mindful_minutes' where id = 'b2b2b2b2-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot set a metric on B value habit';
  -- the consent categories stay server-side
  assert pg_temp.fails($f$select consented_categories from public.provider_connections$f$, '42501'),
    'A cannot read consented_categories';
  assert pg_temp.fails($f$update public.provider_connections set consented_categories = '{steps}'$f$, '42501'),
    'A cannot write consented_categories';
  perform id, user_id, provider, status, last_synced_at from public.provider_connections;
  assert pg_temp.fails($f$select * from public.provider_connections$f$, '42501'), 'select * still denied (0012)';
  -- ingest and fill are for the health-sync function only
  assert pg_temp.fails($f$select public.upsert_provider_activity(auth.uid(), 'health_connect',
      '[{"date":"2026-10-01","metrics":{"steps":1}}]'::jsonb)$f$, '42501'),
    'authenticated cannot execute upsert_provider_activity';
  assert pg_temp.fails($f$select public.fill_habits_from_activity(auth.uid(), '2026-10-01', '2026-10-01')$f$, '42501'),
    'authenticated cannot execute fill_habits_from_activity';
end $$;

reset role;
set role anon;
reset request.jwt.claim.sub;
do $$
begin
  assert pg_temp.fails($f$select public.upsert_provider_activity('aaaaaaaa-0000-0000-0000-00000000000a', 'health_connect',
      '[]'::jsonb)$f$, '42501'), 'anon cannot execute upsert_provider_activity';
  assert pg_temp.fails($f$select public.fill_habits_from_activity('aaaaaaaa-0000-0000-0000-00000000000a',
      '2026-10-01', '2026-10-01')$f$, '42501'), 'anon cannot execute fill_habits_from_activity';
end $$;

-- fixtures: user C with one habit per case, user D with 52 steps habits (as superuser)
reset role;
insert into auth.users(id) values ('cccccccc-0000-0000-0000-00000000000c'), ('dddddddd-0000-0000-0000-00000000000d');
insert into public.user_habits(id, user_id, pillar_id, title, kind, target, auto_source, active, deleted_at, created_at)
select v.id::uuid, 'cccccccc-0000-0000-0000-00000000000c', p.id, v.title, v.kind, v.target, v.src, v.active, v.deleted,
       '2026-01-01'::timestamptz + v.n * interval '1 minute'
  from public.pillars p,
       (values
         (1, 'c1c1c1c1-0000-0000-0000-000000000001', 'C steps', 'value', 8000::numeric, 'steps', true, null::timestamptz),
         (2, 'c2c2c2c2-0000-0000-0000-000000000002', 'C sleep', 'value', 7.5, 'sleep_hours', true, null),
         (3, 'c3c3c3c3-0000-0000-0000-000000000003', 'C workout', 'value', null, 'workout_minutes', true, null),
         (4, 'c4c4c4c4-0000-0000-0000-000000000004', 'C paused mindful', 'value', 10, 'mindful_minutes', false, null),
         (5, 'c5c5c5c5-0000-0000-0000-000000000005', 'C deleted steps', 'value', 10, 'steps', true, now()),
         (6, 'c6c6c6c6-0000-0000-0000-000000000006', 'C plain value', 'value', 10, null, true, null),
         (7, 'c7c7c7c7-0000-0000-0000-000000000007', 'C check', 'check', 1, null, true, null)
       ) as v(n, id, title, kind, target, src, active, deleted)
 where p.slug = 'active-lifestyle';
insert into public.user_habits(user_id, pillar_id, title, kind, target, auto_source, created_at)
select 'dddddddd-0000-0000-0000-00000000000d', p.id, 'D steps ' || i, 'value', 1000, 'steps',
       '2026-01-01'::timestamptz + i * interval '1 minute'
  from public.pillars p, generate_series(1, 52) i
 where p.slug = 'active-lifestyle';
-- a manual log (must prevail) and an older automatic one from a lower-priority provider (must be replaced)
insert into public.habit_logs(user_id, user_habit_id, date, value, source) values
  ('cccccccc-0000-0000-0000-00000000000c', 'c1c1c1c1-0000-0000-0000-000000000001', '2026-10-02', 1, 'manual'),
  ('cccccccc-0000-0000-0000-00000000000c', 'c2c2c2c2-0000-0000-0000-000000000002', '2026-10-01', 5, 'huawei_health');
-- connections: only connected providers with the metric consented ever fill (or ingest)
insert into public.provider_connections(user_id, provider, status, consented_categories)
select 'cccccccc-0000-0000-0000-00000000000c', p, 'connected', '{steps,workout_minutes,sleep_hours,mindful_minutes}'
  from unnest(array['health_connect','huawei_health','strava','apple_health','fitbit','garmin','oura']) p;
insert into public.provider_connections(user_id, provider, status, consented_categories)
  values ('dddddddd-0000-0000-0000-00000000000d', 'health_connect', 'connected', '{steps}');
-- rows of providers the function does not ingest yet (written directly here)
insert into public.provider_activity(user_id, provider, date, payload) values
  ('cccccccc-0000-0000-0000-00000000000c', 'strava', '2026-10-03', '{"steps":1111}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'other_app', '2026-10-04', '{"steps":2222}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'apple_health', '2026-10-05', '{"steps":-5}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'fitbit', '2026-10-05', '{"steps":"abc"}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'garmin', '2026-10-05', '{"steps":777}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'oura', '2026-10-06', '{"steps":100001}');
create function pg_temp.c_logs() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('h', h.title, 'd', l.date, 'v', l.value, 's', l.source, 't', l.target)
                  order by h.title, l.date), '[]'::jsonb)
    from public.habit_logs l join public.user_habits h on h.id = l.user_habit_id
   where l.user_id = 'cccccccc-0000-0000-0000-00000000000c'
$$;
grant execute on function pg_temp.c_logs() to public;
create function pg_temp.log_of(p_title text, p_date date) returns text language sql stable as $$
  select l.value || '/' || l.source || '/' || coalesce(l.target::text, 'null')
    from public.habit_logs l join public.user_habits h on h.id = l.user_habit_id
   where h.title = p_title and l.date = p_date
$$;
grant execute on function pg_temp.log_of(text, date) to public;
create function pg_temp.payload_of(p_user uuid, p_provider text, p_date date) returns jsonb language sql stable as $$
  select payload from public.provider_activity where user_id = p_user and provider = p_provider and date = p_date
$$;
grant execute on function pg_temp.payload_of(uuid, text, date) to public;

set role service_role;
do $$
declare c uuid := 'cccccccc-0000-0000-0000-00000000000c'; n int; res jsonb; snap jsonb; others jsonb;
begin
  -- upsert_provider_activity: validated, rounded, merged per day
  n := public.upsert_provider_activity(c, 'health_connect',
    '[{"date":"2026-10-01","metrics":{"steps":5000.4,"sleep_hours":7.256}},
      {"date":"2026-10-02","metrics":{"workout_minutes":45}}]'::jsonb);
  assert n = 2, 'two day-rows written: ' || n;
  assert pg_temp.payload_of(c, 'health_connect', '2026-10-01') = '{"steps":5000,"sleep_hours":7.26}'::jsonb,
    'integers rounded, hours to 2 decimals: ' || pg_temp.payload_of(c, 'health_connect', '2026-10-01')::text;
  n := public.upsert_provider_activity(c, 'health_connect', '[{"date":"2026-10-01","metrics":{"mindful_minutes":12}}]');
  assert n = 1, 'one day-row merged';
  assert pg_temp.payload_of(c, 'health_connect', '2026-10-01')
         = '{"steps":5000,"sleep_hours":7.26,"mindful_minutes":12}'::jsonb,
    'a sync of one metric keeps the other metrics of that day';
  n := public.upsert_provider_activity(c, 'health_connect', '[{"date":"2026-10-01","metrics":{"steps":5100}}]');
  assert pg_temp.payload_of(c, 'health_connect', '2026-10-01')
         = '{"steps":5100,"sleep_hours":7.26,"mindful_minutes":12}'::jsonb, 'a newer value replaces only its metric';
  n := public.upsert_provider_activity(c, 'huawei_health',
    '[{"date":"2026-10-01","metrics":{"steps":4000,"workout_minutes":60}},{"date":"2026-10-02","metrics":{"steps":3000}}]');
  assert n = 2, 'huawei_health is an accepted provider';
  assert pg_temp.payload_of(c, 'health_connect', '2026-10-02') = '{"workout_minutes":45}'::jsonb, 'providers kept apart';
  assert public.upsert_provider_activity(c, 'health_connect', '[]') = 0, 'an empty batch writes nothing';
  assert public.upsert_provider_activity(c, 'health_connect',
    '[{"date":"2026-10-07","metrics":{"steps":100000,"workout_minutes":1440,"sleep_hours":24,"mindful_minutes":0}}]') = 1,
    'the limits themselves are accepted';
  delete from public.provider_activity where user_id = c and date = '2026-10-07';

  -- invalid input: 22023 and nothing written
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'strava',
      '[{"date":"2026-10-08","metrics":{"steps":1}}]')$f$, '22023'), 'provider outside the allow-list';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'apple_health',
      '[{"date":"2026-10-08","metrics":{"steps":1}}]')$f$, '22023'), 'apple_health is not ingested';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', null,
      '[{"date":"2026-10-08","metrics":{"steps":1}}]')$f$, '22023'), 'null provider';
  assert pg_temp.fails($f$select public.upsert_provider_activity(null, 'health_connect',
      '[{"date":"2026-10-08","metrics":{"steps":1}}]')$f$, '22023'), 'null user';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '{"date":"2026-10-08"}')$f$, '22023'), 'rows must be an array';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"calories":1}}]')$f$, '22023'), 'unknown metric key';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"steps":1,"calories":1}}]')$f$, '22023'), 'unknown key beside a known one';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{}}]')$f$, '22023'), 'empty metrics';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":[1]}]')$f$, '22023'), 'metrics must be an object';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"steps":-1}}]')$f$, '22023'), 'negative value';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"steps":100001}}]')$f$, '22023'), 'steps over the limit';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"workout_minutes":1441}}]')$f$, '22023'), 'workout minutes over the limit';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"mindful_minutes":1441}}]')$f$, '22023'), 'mindful minutes over the limit';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"sleep_hours":24.01}}]')$f$, '22023'), 'sleep hours over the limit';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"steps":"5"}}]')$f$, '22023'), 'a string is not a number';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"steps":null}}]')$f$, '22023'), 'null is not a number';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-02-30","metrics":{"steps":1}}]')$f$, '22023'), 'not a calendar date';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"8/10/2026","metrics":{"steps":1}}]')$f$, '22023'), 'malformed date';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"steps":1}},{"date":"2026-10-08","metrics":{"sleep_hours":1}}]')$f$, '22023'),
    'duplicate dates';
  assert pg_temp.fails($f$select public.upsert_provider_activity('cccccccc-0000-0000-0000-00000000000c', 'health_connect',
      '[{"date":"2026-10-08","metrics":{"steps":1}},{"date":"2026-10-09","metrics":{"steps":-1}}]')$f$, '22023'),
    'one bad day rejects the batch';
  assert (select count(*) from public.provider_activity where user_id = c and date >= '2026-10-08') = 0,
    'nothing written by a rejected call';

  -- fill_habits_from_activity
  others := (select coalesce(jsonb_agg(l order by l.id), '[]') from public.habit_logs l where l.user_id <> c);
  res := public.fill_habits_from_activity(c, '2026-10-01', '2026-10-08');
  assert res = '{"written": 6, "skippedManual": 1, "habitsUpdated": 3, "habitsIgnored": 0}'::jsonb, 'counts: ' || res::text;
  assert pg_temp.log_of('C steps', '2026-10-01') = '5100/health_connect/8000', 'health_connect beats huawei_health';
  assert pg_temp.log_of('C steps', '2026-10-02') = '1/manual/null', 'a manual log is never overwritten';
  assert pg_temp.log_of('C steps', '2026-10-03') = '1111/strava/8000', 'falls back to strava when it is the only one';
  assert pg_temp.log_of('C steps', '2026-10-04') is null, 'a provider outside the priority list never fills';
  assert pg_temp.log_of('C steps', '2026-10-05') = '777/garmin/8000', 'invalid stored values are skipped (falls back)';
  assert pg_temp.log_of('C steps', '2026-10-06') is null, 'a stored value over the limit never fills';
  assert pg_temp.log_of('C sleep', '2026-10-01') = '7.26/health_connect/7.5', 'an older lower-priority automatic log is replaced';
  assert pg_temp.log_of('C workout', '2026-10-01') = '60/huawei_health/null',
    'falls back to huawei_health when health_connect has not that metric (target null)';
  assert pg_temp.log_of('C workout', '2026-10-02') = '45/health_connect/null', 'health_connect workout';
  assert (select count(*) from public.habit_logs where user_habit_id in ('c4c4c4c4-0000-0000-0000-000000000004',
      'c5c5c5c5-0000-0000-0000-000000000005', 'c6c6c6c6-0000-0000-0000-000000000006',
      'c7c7c7c7-0000-0000-0000-000000000007')) = 0,
    'paused, deleted, check habits and habits without auto_source are untouched';
  assert (select coalesce(jsonb_agg(l order by l.id), '[]') from public.habit_logs l where l.user_id <> c) = others,
    'no other user''s log is touched';

  snap := pg_temp.c_logs();
  res := public.fill_habits_from_activity(c, '2026-10-01', '2026-10-08');
  assert res = '{"written": 6, "skippedManual": 1, "habitsUpdated": 3, "habitsIgnored": 0}'::jsonb, 'same counts: ' || res::text;
  assert pg_temp.c_logs() = snap, 'fill_habits_from_activity is idempotent';

  -- a newer, higher-priority value replaces an automatic log
  perform public.upsert_provider_activity(c, 'health_connect', '[{"date":"2026-10-03","metrics":{"steps":9999}}]');
  res := public.fill_habits_from_activity(c, '2026-10-03', '2026-10-03');
  assert res = '{"written": 1, "skippedManual": 0, "habitsUpdated": 1, "habitsIgnored": 0}'::jsonb, 'one day: ' || res::text;
  assert pg_temp.log_of('C steps', '2026-10-03') = '9999/health_connect/8000', 'replaced by the higher-priority provider';
  assert pg_temp.log_of('C steps', '2026-10-01') = '5100/health_connect/8000', 'days outside the range are left alone';

  -- another user's id fills nothing of C, and a user without data gets zeros
  snap := pg_temp.c_logs();
  res := public.fill_habits_from_activity('aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-01', '2026-10-08');
  assert res = '{"written": 0, "skippedManual": 0, "habitsUpdated": 0, "habitsIgnored": 0}'::jsonb, 'foreign: ' || res::text;
  assert pg_temp.c_logs() = snap, 'nothing of C written for another user id';

  -- the range is at most 8 days
  assert public.fill_habits_from_activity(c, '2026-10-01', '2026-10-08') ->> 'written' = '6', 'an 8-day range is accepted';
  assert pg_temp.fails($f$select public.fill_habits_from_activity('cccccccc-0000-0000-0000-00000000000c',
      '2026-10-01', '2026-10-09')$f$, '22023'), 'a 9-day range is rejected';
  assert pg_temp.fails($f$select public.fill_habits_from_activity('cccccccc-0000-0000-0000-00000000000c',
      '2026-10-02', '2026-10-01')$f$, '22023'), 'an inverted range is rejected';
  assert pg_temp.fails($f$select public.fill_habits_from_activity(null, '2026-10-01', '2026-10-01')$f$, '22023'),
    'null user';
  assert pg_temp.fails($f$select public.fill_habits_from_activity('cccccccc-0000-0000-0000-00000000000c',
      null, '2026-10-01')$f$, '22023'), 'null date';

  -- at most 50 habits per call (oldest first); the rest is reported
  perform public.upsert_provider_activity('dddddddd-0000-0000-0000-00000000000d', 'health_connect',
    '[{"date":"2026-10-01","metrics":{"steps":100}}]');
  res := public.fill_habits_from_activity('dddddddd-0000-0000-0000-00000000000d', '2026-10-01', '2026-10-01');
  assert res = '{"written": 50, "skippedManual": 0, "habitsUpdated": 50, "habitsIgnored": 2}'::jsonb, 'cap: ' || res::text;
  assert (select count(*) from public.habit_logs l join public.user_habits h on h.id = l.user_habit_id
           where h.title in ('D steps 51', 'D steps 52')) = 0, 'the two newest habits are the ignored ones';

  -- consent categories: server-written, known metrics only
  update public.provider_connections set consented_categories = '{steps,sleep_hours}'
   where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and provider = 'health_connect';
  assert (select consented_categories from public.provider_connections
           where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and provider = 'health_connect') = '{steps,sleep_hours}',
    'service_role records the consented categories';
  assert pg_temp.fails($f$update public.provider_connections set consented_categories = '{steps,calories}'
      where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$f$, '23514'), 'an unknown category must violate the check';
  assert pg_temp.fails($f$update public.provider_connections set consented_categories = null
      where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$f$, '23502'), 'consented_categories is not null';
  assert (select consented_categories from public.provider_connections
           where provider = 'strava' and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = '{}',
    'consented_categories defaults to empty';
end $$;

-- ---------- 0012 fix round 1: consent and connection state are enforced in SQL ----------
reset role;
insert into auth.users(id) values ('eeeeeeee-0000-0000-0000-00000000000e'), ('ffffffff-0000-0000-0000-00000000000f');
insert into public.user_habits(id, user_id, pillar_id, title, kind, target, auto_source, created_at)
select v.id::uuid, v.u::uuid, p.id, v.title, 'value', 10, v.src, '2026-01-01'::timestamptz + v.n * interval '1 minute'
  from public.pillars p,
       (values (1, 'e1e1e1e1-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000e', 'E steps', 'steps'),
               (2, 'e2e2e2e2-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-00000000000e', 'E sleep', 'sleep_hours'),
               (3, 'f1f1f1f1-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-00000000000f', 'F steps', 'steps')
       ) as v(n, id, u, title, src)
 where p.slug = 'active-lifestyle';
insert into public.provider_connections(user_id, provider, status, consented_categories) values
  ('eeeeeeee-0000-0000-0000-00000000000e', 'health_connect', 'connected', '{steps,sleep_hours}'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'huawei_health', 'disconnected', '{steps}');
-- F has data but no connection row at all
insert into public.provider_activity(user_id, provider, date, payload)
  values ('ffffffff-0000-0000-0000-00000000000f', 'health_connect', '2026-10-01', '{"steps":4242}');
create function pg_temp.e_logs() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('h', h.title, 'd', l.date, 'v', l.value, 's', l.source)
                  order by h.title, l.date), '[]'::jsonb)
    from public.habit_logs l join public.user_habits h on h.id = l.user_habit_id
   where l.user_id = 'eeeeeeee-0000-0000-0000-00000000000e'
$$;
grant execute on function pg_temp.e_logs() to public;

set role service_role;
do $$
declare e uuid := 'eeeeeeee-0000-0000-0000-00000000000e'; res jsonb; snap jsonb;
begin
  assert (select count(*) from pg_proc
           where proname in ('upsert_provider_activity', 'fill_habits_from_activity')
             and proconfig @> array['search_path=""', 'jit=off']) = 2, 'both functions: search_path empty and jit off';
  -- upsert_provider_activity: the consent check is part of the write
  assert public.upsert_provider_activity(e, 'health_connect',
    '[{"date":"2026-10-01","metrics":{"steps":1000,"sleep_hours":7}},
      {"date":"2026-10-02","metrics":{"steps":2000,"sleep_hours":8}}]') = 2, 'connected + consented writes';
  assert pg_temp.fails($f$select public.upsert_provider_activity('eeeeeeee-0000-0000-0000-00000000000e', 'huawei_health',
      '[{"date":"2026-10-03","metrics":{"steps":1}}]')$f$, 'P0001'), 'a disconnected provider raises consent_required';
  assert pg_temp.fails($f$select public.upsert_provider_activity('eeeeeeee-0000-0000-0000-00000000000e', 'health_connect',
      '[{"date":"2026-10-03","metrics":{"steps":1}},{"date":"2026-10-04","metrics":{"mindful_minutes":5}}]')$f$, 'P0001'),
    'an unconsented metric raises consent_required';
  assert pg_temp.fails($f$select public.upsert_provider_activity('ffffffff-0000-0000-0000-00000000000f', 'health_connect',
      '[{"date":"2026-10-03","metrics":{"steps":1}}]')$f$, 'P0001'), 'no connection row raises consent_required';
  begin
    perform public.upsert_provider_activity(e, 'health_connect', '[{"date":"2026-10-03","metrics":{"workout_minutes":1}}]');
    assert false, 'unreachable';
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'consent_required', 'the error message is exactly consent_required: ' || sqlerrm;
  end;
  assert (select count(*) from public.provider_activity where user_id = e and date >= '2026-10-03') = 0,
    'nothing written by a refused call (not even its consented metric)';
  assert (select count(*) from public.provider_activity where user_id = e and provider = 'huawei_health') = 0,
    'nothing written for the disconnected provider';
  assert pg_temp.fails($f$select public.upsert_provider_activity('eeeeeeee-0000-0000-0000-00000000000e', 'strava',
      '[{"date":"2026-10-03","metrics":{"steps":1}}]')$f$, '22023'), 'argument validation still comes first';
  perform public.upsert_provider_activity(e, 'health_connect', '[{"date":"2026-10-01","metrics":{"steps":1100}}]');
  assert (select payload from public.provider_activity where user_id = e and date = '2026-10-01' and provider = 'health_connect')
         = '{"steps":1100,"sleep_hours":7}'::jsonb, 'merge semantics unchanged';

  res := public.fill_habits_from_activity(e, '2026-10-01', '2026-10-01');
  assert res = '{"written": 2, "skippedManual": 0, "habitsUpdated": 2, "habitsIgnored": 0}'::jsonb, 'both consented: ' || res::text;

  -- (a) reconnect with {steps} only: the stored sleep values are never used again
  update public.provider_connections set consented_categories = '{steps}' where user_id = e and provider = 'health_connect';
  update public.provider_activity set payload = payload || '{"sleep_hours":9}' where user_id = e and date = '2026-10-01';
  res := public.fill_habits_from_activity(e, '2026-10-01', '2026-10-02');
  assert res = '{"written": 2, "skippedManual": 0, "habitsUpdated": 1, "habitsIgnored": 0}'::jsonb, 'steps only: ' || res::text;
  assert pg_temp.log_of('E sleep', '2026-10-01') = '7.00/health_connect/10', 'the sleep log already written is left alone';
  assert pg_temp.log_of('E sleep', '2026-10-02') is null, 'the stored sleep value of a revoked category is not used';
  assert pg_temp.log_of('E steps', '2026-10-02') = '2000/health_connect/10', 'steps still filled';
  assert (select payload ->> 'sleep_hours' from public.provider_activity where user_id = e and date = '2026-10-02') = '8.00',
    'stored data is kept';
  -- (e) idempotence unchanged
  snap := pg_temp.e_logs();
  assert public.fill_habits_from_activity(e, '2026-10-01', '2026-10-02') = res, 'same counts';
  assert pg_temp.e_logs() = snap, 'idempotent';

  -- (b) a disconnected provider fills nothing
  update public.provider_connections set status = 'disconnected' where user_id = e and provider = 'health_connect';
  res := public.fill_habits_from_activity(e, '2026-10-01', '2026-10-02');
  assert res = '{"written": 0, "skippedManual": 0, "habitsUpdated": 0, "habitsIgnored": 0}'::jsonb, 'disconnected: ' || res::text;
  assert pg_temp.e_logs() = snap, 'logs untouched after a disconnect';

  -- (c) data without any connection row fills nothing
  res := public.fill_habits_from_activity('ffffffff-0000-0000-0000-00000000000f', '2026-10-01', '2026-10-01');
  assert res = '{"written": 0, "skippedManual": 0, "habitsUpdated": 0, "habitsIgnored": 0}'::jsonb, 'no row: ' || res::text;
  assert (select count(*) from public.habit_logs where user_id = 'ffffffff-0000-0000-0000-00000000000f') = 0, 'F untouched';

  -- (d) priority resolves among connected + consented providers only
  update public.provider_connections set status = 'connected' where user_id = e and provider = 'huawei_health';
  perform public.upsert_provider_activity(e, 'huawei_health', '[{"date":"2026-10-03","metrics":{"steps":500}}]');
  update public.provider_connections set status = 'connected' where user_id = e and provider = 'health_connect';
  perform public.upsert_provider_activity(e, 'health_connect', '[{"date":"2026-10-03","metrics":{"steps":900}}]');
  perform public.fill_habits_from_activity(e, '2026-10-03', '2026-10-03');
  assert pg_temp.log_of('E steps', '2026-10-03') = '900/health_connect/10', 'both connected: health_connect wins';
  update public.provider_connections set status = 'disconnected' where user_id = e and provider = 'health_connect';
  perform public.fill_habits_from_activity(e, '2026-10-03', '2026-10-03');
  assert pg_temp.log_of('E steps', '2026-10-03') = '500/huawei_health/10', 'best provider disconnected: the next connected one wins';
  update public.provider_connections set status = 'connected', consented_categories = '{sleep_hours}'
   where user_id = e and provider = 'health_connect';
  perform public.fill_habits_from_activity(e, '2026-10-03', '2026-10-03');
  assert pg_temp.log_of('E steps', '2026-10-03') = '500/huawei_health/10', 'best provider without the metric consented: skipped';
end $$;

-- ---------- anon ----------
reset role;
set role anon;
reset request.jwt.claim.sub;
do $$
declare t text;
begin
  foreach t in array array['profiles','user_habits','habit_logs','user_stats','pillar_scores','user_achievements',
                           'mascot_state','provider_connections','provider_activity'] loop
    assert pg_temp.fails(format('select count(*) from public.%I', t), '42501'), 'anon must not read ' || t;
    assert pg_temp.fails(format('insert into public.%I select * from public.%I', t, t)), 'anon must not write ' || t;
  end loop;
  assert (select count(*) from public.pillars) = 10, 'anon reads public catalog';
end $$;

-- ---------- service_role can write server-owned tables ----------
reset role;
set role service_role;
do $$
begin
  insert into public.user_stats(user_id) values ('bbbbbbbb-0000-0000-0000-00000000000b');
  update public.user_stats set xp_total = 50 where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  update public.user_stats set computed_for = '2026-11-06' where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  assert (select computed_for from public.user_stats where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = '2026-11-06',
    'service_role records the day stats were computed for (0010)';
  insert into public.pillar_scores(user_id, pillar_id, score)
    select 'bbbbbbbb-0000-0000-0000-00000000000b', id, 50 from public.pillars limit 1;
  insert into public.user_achievements(user_id, achievement_id)
    select 'bbbbbbbb-0000-0000-0000-00000000000b', id from public.achievements limit 1;
  insert into public.mascot_state(user_id) values ('bbbbbbbb-0000-0000-0000-00000000000b');
  update public.mascot_state set stage = 2 where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  assert (select access_token_enc from public.provider_connections where provider = 'strava'
            and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 'SECRET-ACCESS', 'service_role reads tokens';
  update public.provider_connections set last_synced_at = now();
  insert into public.provider_activity(user_id, provider, date) values ('aaaaaaaa-0000-0000-0000-00000000000a','strava','2026-01-02');
  -- service_role CAN write provider-sourced logs (ruling F), on any date (no client window, 0009)
  insert into public.habit_logs(user_id, user_habit_id, date, value, source)
    values ('bbbbbbbb-0000-0000-0000-00000000000b','b1b1b1b1-0000-0000-0000-000000000001','2026-01-03', 5000, 'strava');
  assert (select source from public.habit_logs where date = '2026-01-03'
            and user_habit_id = 'b1b1b1b1-0000-0000-0000-000000000001') = 'strava', 'service_role inserted strava log';
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value, source)
      values ('bbbbbbbb-0000-0000-0000-00000000000b','b1b1b1b1-0000-0000-0000-000000000001','2026-01-04', -1, 'strava')$f$, '23514'),
    'negative value rejected for service_role too';
end $$;

reset role;
\echo ALL DB TESTS OK
