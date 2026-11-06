-- Target snapshot on habit_logs (final review F1).
-- A log records the habit's target at the time it was written, so changing a value
-- habit's target ("ajustar metas", spec §1) never rewrites past days: the engine scores
-- each log against its own target and falls back to the habit's current target only
-- when the log has none (provider rows, rows written before this migration).
-- Check habits store 1. Null means "no snapshot".

alter table public.habit_logs
  add column target numeric null,
  add constraint habit_logs_target_positive check (target is null or target > 0);

-- Existing rows: freeze them at the habit's target as it is now (the best value known),
-- so a target change made after this migration no longer moves them.
update public.habit_logs l
   set target = case when h.kind = 'check' then 1 else h.target end
  from public.user_habits h
 where h.id = l.user_habit_id
   and l.target is null
   and (h.kind = 'check' or h.target > 0);
