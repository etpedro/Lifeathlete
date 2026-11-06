-- Initial achievements with PT/EN i18n (spec section 4).
-- Ruling L: rule JSON identifies pillars by SLUG (the engine works on slugs end to end);
-- achievements.pillar_id is kept consistent with rule.pillar (null = global).
-- xp_reward stays 0: per ruling G, xp_total is only per-day XP + weekly balance bonuses.

insert into public.achievements (code, pillar_id, rule, xp_reward)
select v.code, p.id, v.rule::jsonb, 0
from (values
  ('streak_meditation_30', 'meditation', '{"type":"streak","days":30,"pillar":"meditation"}'),
  ('streak_reading_30', 'reading', '{"type":"streak","days":30,"pillar":"reading"}'),
  ('streak_exercise_30', 'exercise', '{"type":"streak","days":30,"pillar":"exercise"}'),
  ('streak_global_100', null, '{"type":"streak","days":100}'),
  ('balance_week_10', null, '{"type":"balance","pillars":10}'),
  ('total_100', null, '{"type":"total","count":100}')
) as v(code, pillar_slug, rule)
left join public.pillars p on p.slug = v.pillar_slug;

insert into public.achievements_i18n (achievement_id, locale, name, description)
select a.id, v.locale, v.name, v.description from public.achievements a join (values
  ('streak_meditation_30', 'pt', 'Mente serena', '30 dias seguidos a meditar.'),
  ('streak_meditation_30', 'en', 'Calm mind', 'Meditate 30 days in a row.'),
  ('streak_reading_30', 'pt', 'Leitor dedicado', '30 dias seguidos a ler.'),
  ('streak_reading_30', 'en', 'Devoted reader', 'Read 30 days in a row.'),
  ('streak_exercise_30', 'pt', 'Corpo em movimento', '30 dias seguidos de exercício.'),
  ('streak_exercise_30', 'en', 'Body in motion', 'Exercise 30 days in a row.'),
  ('streak_global_100', 'pt', 'Cem dias', '100 dias seguidos com pelo menos um hábito cumprido.'),
  ('streak_global_100', 'en', 'One hundred days', '100 days in a row with at least one habit done.'),
  ('balance_week_10', 'pt', 'Roda completa', 'Atividade nos 10 pilares na mesma semana.'),
  ('balance_week_10', 'en', 'Full wheel', 'Activity in all 10 pillars in the same week.'),
  ('total_100', 'pt', 'Cem hábitos', '100 hábitos cumpridos.'),
  ('total_100', 'en', 'One hundred habits', '100 habits completed.')
) as v(code, locale, name, description) on v.code = a.code;
