-- Lifeathlete schema (spec section 3)

-- ===== Catalog =====
create table public.pillars (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  icon text not null,
  color text not null,
  sort int not null unique
);

create table public.pillar_i18n (
  pillar_id uuid not null references public.pillars(id) on delete cascade,
  locale text not null check (locale in ('pt','en')),
  name text not null,
  description text,
  primary key (pillar_id, locale)
);

create table public.habit_templates (
  id uuid primary key default gen_random_uuid(),
  pillar_id uuid not null references public.pillars(id) on delete cascade,
  slug text not null unique,
  kind text not null check (kind in ('check','value')),
  default_target numeric,
  unit text,
  provider_source text,
  sort int not null default 0
);

create table public.habit_templates_i18n (
  template_id uuid not null references public.habit_templates(id) on delete cascade,
  locale text not null check (locale in ('pt','en')),
  title text not null,
  description text,
  primary key (template_id, locale)
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  pillar_id uuid references public.pillars(id) on delete cascade, -- null = global
  rule jsonb not null default '{}'::jsonb,
  xp_reward int not null default 0
);

create table public.achievements_i18n (
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  locale text not null check (locale in ('pt','en')),
  name text not null,
  description text,
  primary key (achievement_id, locale)
);

-- ===== User data =====
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'pt' check (locale in ('pt','en')),
  timezone text not null default 'UTC',
  display_name text,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.habit_templates(id) on delete set null,
  pillar_id uuid not null references public.pillars(id),
  title text not null,
  kind text not null check (kind in ('check','value')),
  target numeric,
  active boolean not null default true,
  deleted_at timestamptz, -- soft delete: logs are kept
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index user_habits_user_idx on public.user_habits(user_id);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_habit_id uuid not null,
  date date not null,
  value numeric not null default 1,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (user_habit_id, date),
  -- the log's user must be the habit's owner (checked regardless of RLS)
  foreign key (user_habit_id, user_id) references public.user_habits(id, user_id)
);
create index habit_logs_user_date_idx on public.habit_logs(user_id, date);

create table public.user_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp_total int not null default 0,
  level int not null default 1,
  current_streak int not null default 0,
  best_streak int not null default 0,
  last_active_date date
);

create table public.pillar_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  pillar_id uuid not null references public.pillars(id) on delete cascade,
  score numeric not null default 0, -- % over a 30-day window
  updated_at timestamptz not null default now(),
  primary key (user_id, pillar_id)
);

create table public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.mascot_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stage int not null default 1,
  variant text not null default 'default'
);

-- ===== Integrations =====
create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  access_token_enc text,   -- encrypted; server-side only
  refresh_token_enc text,  -- encrypted; server-side only
  expires_at timestamptz,
  status text not null default 'connected',
  last_synced_at timestamptz,
  unique (user_id, provider)
);

create table public.provider_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  date date not null,
  payload jsonb not null default '{}'::jsonb,
  unique (user_id, provider, date)
);
