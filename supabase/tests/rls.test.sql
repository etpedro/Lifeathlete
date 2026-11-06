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
  assert (select count(*) from public.achievements where code <> 'test_ach') = 0, 'achievements must not be seeded here';
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
    values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', '2026-01-02', 1);
  update public.profiles set display_name = 'A2' where user_id = auth.uid();
  assert (select display_name from public.profiles) = 'A2', 'A updated own profile';

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
      where date = '2026-01-02'$f$),
    'A cannot re-point a log to B habit';

  -- unique (user_habit_id, date)
  assert pg_temp.fails($f$insert into public.habit_logs(user_id, user_habit_id, date, value)
      values (auth.uid(), 'a1a1a1a1-0000-0000-0000-000000000001', '2026-01-02', 1)$f$, '23505'),
    'duplicate (user_habit_id,date) must violate unique';

  -- server-written tables: read-only for the client
  assert (select count(*) from public.user_stats) = 1, 'A can read own user_stats';
  assert pg_temp.fails($f$insert into public.user_stats(user_id) values (auth.uid())$f$), 'A cannot insert user_stats';
  assert pg_temp.fails($f$update public.user_stats set xp_total = 999999$f$), 'A cannot update user_stats';
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
  assert (select count(*) from public.achievements) = 1, 'A reads achievements';
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
end $$;

-- ---------- user B sees nothing of A ----------
reset role;
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
  insert into public.pillar_scores(user_id, pillar_id, score)
    select 'bbbbbbbb-0000-0000-0000-00000000000b', id, 50 from public.pillars limit 1;
  insert into public.user_achievements(user_id, achievement_id)
    select 'bbbbbbbb-0000-0000-0000-00000000000b', id from public.achievements limit 1;
  insert into public.mascot_state(user_id) values ('bbbbbbbb-0000-0000-0000-00000000000b');
  update public.mascot_state set stage = 2 where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  assert (select access_token_enc from public.provider_connections) = 'SECRET-ACCESS', 'service_role reads tokens';
  update public.provider_connections set last_synced_at = now();
  insert into public.provider_activity(user_id, provider, date) values ('aaaaaaaa-0000-0000-0000-00000000000a','strava','2026-01-02');
end $$;

reset role;
\echo ALL DB TESTS OK
