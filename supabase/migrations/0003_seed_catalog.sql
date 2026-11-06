-- Catalog seed: 10 pillars, habit templates and PT/EN translations

insert into public.pillars (slug, icon, color, sort) values
  ('exercise', 'dumbbell', '#E4572E', 1),
  ('nutrition', 'apple', '#76B041', 2),
  ('nature', 'tree', '#2E933C', 3),
  ('gratitude', 'heart', '#F2A541', 4),
  ('screens', 'smartphone', '#6C757D', 5),
  ('lightness', 'feather', '#5BC0EB', 6),
  ('meditation', 'lotus', '#9B5DE5', 7),
  ('active-lifestyle', 'bike', '#F15BB5', 8),
  ('reading', 'book', '#3A86FF', 9),
  ('family', 'users', '#FB5607', 10);

insert into public.pillar_i18n (pillar_id, locale, name, description)
select p.id, v.locale, v.name, v.description from public.pillars p join (values
  ('exercise', 'pt', 'Exercício regular', 'Mexer o corpo todos os dias.'),
  ('exercise', 'en', 'Regular exercise', 'Move your body every day.'),
  ('nutrition', 'pt', 'Alimentação saudável', 'Comer bem para ter energia.'),
  ('nutrition', 'en', 'Healthy eating', 'Eat well to fuel your energy.'),
  ('nature', 'pt', 'Carregar baterias na natureza', 'Passar tempo ao ar livre.'),
  ('nature', 'en', 'Recharge in nature', 'Spend time outdoors.'),
  ('gratitude', 'pt', 'Viver com gratidão', 'Reconhecer o que é bom.'),
  ('gratitude', 'en', 'Live with gratitude', 'Notice what is good.'),
  ('screens', 'pt', 'Ecrãs em doses moderadas', 'Usar ecrãs com equilíbrio.'),
  ('screens', 'en', 'Screens in moderation', 'Use screens in balance.'),
  ('lightness', 'pt', 'Viver leve como uma libelinha', 'Leveza, humor e brincadeira.'),
  ('lightness', 'en', 'Live light as a dragonfly', 'Lightness, humor and play.'),
  ('meditation', 'pt', 'Meditação', 'Acalmar a mente.'),
  ('meditation', 'en', 'Meditation', 'Calm the mind.'),
  ('active-lifestyle', 'pt', 'Estilo de vida saudável e ativo', 'Hábitos diários que mantêm o corpo ativo.'),
  ('active-lifestyle', 'en', 'Healthy, active lifestyle', 'Daily habits that keep you active.'),
  ('reading', 'pt', 'Ler mais', 'Alimentar a curiosidade.'),
  ('reading', 'en', 'Read more', 'Feed your curiosity.'),
  ('family', 'pt', 'Família e valores', 'Cuidar de quem importa.'),
  ('family', 'en', 'Family and values', 'Care for the people who matter.')
) as v(slug, locale, name, description) on v.slug = p.slug;

create temporary table _tpl (pillar_slug text, slug text, kind text, default_target numeric, unit text, sort int, pt text, en text);

insert into _tpl values
  ('exercise', 'walk-30', 'value', 30, 'minutes', 1, 'Caminhar 30 min', 'Walk 30 min'),
  ('exercise', 'workout', 'check', null, null, 2, 'Treino do dia', 'Daily workout'),
  ('exercise', 'steps', 'value', 8000, 'steps', 3, '8000 passos', '8,000 steps'),
  ('nutrition', 'fruit-veg', 'value', 5, 'portions', 1, '5 porções de fruta e legumes', '5 portions of fruit and veg'),
  ('nutrition', 'water', 'value', 2, 'liters', 2, 'Beber 2 L de água', 'Drink 2 L of water'),
  ('nutrition', 'no-sugar', 'check', null, null, 3, 'Sem açúcar adicionado', 'No added sugar'),
  ('nature', 'outdoors', 'value', 20, 'minutes', 1, '20 min ao ar livre', '20 min outdoors'),
  ('nature', 'green-space', 'check', null, null, 2, 'Visitar um espaço verde', 'Visit a green space'),
  ('gratitude', 'gratitude-3', 'value', 3, 'items', 1, 'Anotar 3 gratidões', 'Write down 3 gratitudes'),
  ('gratitude', 'thank-someone', 'check', null, null, 2, 'Agradecer a alguém', 'Thank someone'),
  ('screens', 'screen-2h', 'check', null, null, 1, 'Menos de 2h de ecrã', 'Under 2h of screen time'),
  ('screens', 'no-screen-bed', 'check', null, null, 2, 'Sem ecrãs antes de dormir', 'No screens before bed'),
  ('screens', 'screen-break', 'check', null, null, 3, 'Pausa de ecrã ao almoço', 'Screen break at lunch'),
  ('lightness', 'play', 'value', 15, 'minutes', 1, '15 min de lazer e brincadeira', '15 min of play and leisure'),
  ('lightness', 'laugh', 'check', null, null, 2, 'Rir e divertir-me', 'Laugh and have fun'),
  ('lightness', 'unplug', 'check', null, null, 3, 'Fazer algo sem objetivo', 'Do something with no goal'),
  ('meditation', 'meditate-10', 'value', 10, 'minutes', 1, 'Meditar 10 min', 'Meditate 10 min'),
  ('meditation', 'breathing', 'value', 5, 'minutes', 2, 'Respiração consciente 5 min', 'Mindful breathing 5 min'),
  ('meditation', 'body-scan', 'check', null, null, 3, 'Body scan antes de dormir', 'Bedtime body scan'),
  ('active-lifestyle', 'stairs', 'check', null, null, 1, 'Usar as escadas', 'Take the stairs'),
  ('active-lifestyle', 'stand-hour', 'value', 6, 'hours', 2, 'Levantar-me a cada hora', 'Stand up every hour'),
  ('active-lifestyle', 'sleep-8', 'value', 8, 'hours', 3, 'Dormir 8 horas', 'Sleep 8 hours'),
  ('reading', 'read-20', 'value', 20, 'minutes', 1, 'Ler 20 min', 'Read 20 min'),
  ('reading', 'read-pages', 'value', 10, 'pages', 2, 'Ler 10 páginas', 'Read 10 pages'),
  ('reading', 'learn', 'check', null, null, 3, 'Aprender algo novo', 'Learn something new'),
  ('family', 'family-time', 'value', 30, 'minutes', 1, '30 min de tempo em família', '30 min of family time'),
  ('family', 'call-loved', 'check', null, null, 2, 'Ligar a alguém querido', 'Call a loved one'),
  ('family', 'family-meal', 'check', null, null, 3, 'Refeição em família', 'Family meal');

insert into public.habit_templates (pillar_id, slug, kind, default_target, unit, sort)
select p.id, t.slug, t.kind, t.default_target, t.unit, t.sort from _tpl t join public.pillars p on p.slug = t.pillar_slug;

insert into public.habit_templates_i18n (template_id, locale, title)
select h.id, 'pt', t.pt from _tpl t join public.habit_templates h on h.slug = t.slug
union all
select h.id, 'en', t.en from _tpl t join public.habit_templates h on h.slug = t.slug;
drop table _tpl;
