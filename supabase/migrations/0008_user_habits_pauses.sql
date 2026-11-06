-- Pause intervals on user_habits (final review F2).
-- `active` alone has no history, so the engine could not tell which days a habit was
-- paused: a paused habit kept blocking the day-complete and weekly balance bonuses.
-- `pauses` is a JSON array of { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" | null } local
-- dates (profiles.timezone): `from` inclusive, `to` = the resume day (exclusive), null
-- while still paused. The client maintains it together with `active` (setHabitActive).

-- The local calendar date "now" in an IANA timezone; an invalid, empty or missing zone
-- falls back to UTC (same rule as the app and the recalculate function). Also used by
-- the habit_logs date window (0009).
create or replace function public.safe_local_date(tz text) returns date
language plpgsql stable
set search_path = ''
as $$
begin
  return (now() at time zone coalesce(nullif(tz, ''), 'UTC'))::date;
exception when others then
  return (now() at time zone 'UTC')::date;
end $$;

alter table public.user_habits
  add column pauses jsonb not null default '[]'::jsonb,
  add constraint user_habits_pauses_array check (jsonb_typeof(pauses) = 'array');

-- Habits already paused: their pause start is unknown, so they count as paused from the
-- owner's local today (past days keep the bonuses they had).
update public.user_habits h
   set pauses = jsonb_build_array(jsonb_build_object(
         'from', public.safe_local_date((select p.timezone from public.profiles p where p.user_id = h.user_id))::text,
         'to', null))
 where not h.active and h.deleted_at is null;
