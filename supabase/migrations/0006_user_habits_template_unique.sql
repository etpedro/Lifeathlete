-- One active habit per (user, template) (controller ruling for Task 8).
-- Makes onboarding idempotent at the database level: a duplicate template habit is
-- rejected with unique_violation (23505). Custom habits (template_id null) and
-- soft-deleted habits (deleted_at not null) are not constrained, so a user can
-- re-add a template after soft-deleting it.
create unique index user_habits_user_template_active_uidx
  on public.user_habits (user_id, template_id)
  where template_id is not null and deleted_at is null;
