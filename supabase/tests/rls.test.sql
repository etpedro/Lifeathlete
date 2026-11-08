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
  insert into public.provider_connections(user_id, provider, status, consented_at)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'health_connect', 'connected', now());
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
  assert (select access_token_enc from public.provider_connections where provider = 'strava') = 'SECRET-ACCESS', 'service_role reads tokens';
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
