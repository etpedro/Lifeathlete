-- The local day (profiles.timezone) a recalculation was computed for (final review F3).
-- Written by the recalculate Edge Function; the app requests a new recalculation when
-- it is older than the user's local today (streaks and the resting mascot depend on the
-- day even without new logs). Null = written before this column existed.
alter table public.user_stats add column computed_for date;
