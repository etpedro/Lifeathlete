-- Automatic steps, phase 1 (health-sync Edge Function). Additive only.
--
-- provider_connections.consented_at: when the user accepted the steps consent text
-- (written by health-sync with service_role). It is deliberately NOT added to the
-- authenticated column-select grant of 0002, which keeps exposing only
-- (id, user_id, provider, status, last_synced_at): consent and tokens stay server-side.
--
-- user_habits.auto_source: which automatic source fills a habit's daily value. Only
-- 'steps' exists, and only value habits can have one. The client may set it on its own
-- habits through the existing user_habits update grant/policy (0002).
--
-- Unchanged: the client still cannot write provider_activity, provider_connections or
-- non-manual habit_logs (0002, 0005); health-sync writes them with service_role.

alter table public.provider_connections
  add column consented_at timestamptz;

alter table public.user_habits
  add column auto_source text null,
  add constraint user_habits_auto_source_known check (auto_source in ('steps')),
  add constraint user_habits_auto_source_value_kind check (auto_source is null or kind = 'value');
