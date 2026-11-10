-- 팀버전 (Work): teams, email invites, who is online, and dives (a group call with an agenda for picked members).
-- Safe to run again. Only the `integrations` Edge Function reads and writes these tables (service key): RLS is on with
-- no policies, so the app's login token cannot touch them directly — every request goes through the function, which
-- checks the person's membership. (That also keeps the rules in one place for a later move off Supabase.)

create table if not exists public.work_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One row per invited email; user_id is filled in when that person accepts (status → active).
create table if not exists public.work_members (
  team_id uuid not null references public.work_teams(id) on delete cascade,
  email text not null check (email = lower(email)),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (team_id, email)
);
-- Optional: which of this member's own 체커 teams (to-do groups) they tagged the Work team with. Only a link — nothing
-- is shared or created; each member picks their own (or none).
alter table public.work_members add column if not exists checker_team text check (checker_team is null or char_length(checker_team) <= 64);
-- Several 체커 teams per Work team. checker_team (above) keeps the first, for apps that only know one.
alter table public.work_members add column if not exists checker_teams text[] not null default '{}';
update public.work_members set checker_teams = array[checker_team] where checker_team is not null and checker_teams = '{}';
create index if not exists work_members_user on public.work_members (user_id);
create index if not exists work_members_email on public.work_members (email);

-- Online = an app signed in as this person asked for the team state within the last ~45 s. The name shown to teammates.
create table if not exists public.work_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text check (char_length(name) <= 20),
  last_seen timestamptz not null default now(),
  in_dive uuid
);
-- The person's pet (species, design, name…) so teammates looking at their board on a computer see it there too.
alter table public.work_presence add column if not exists pet jsonb;

create table if not exists public.work_dives (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.work_teams(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  agenda text not null check (char_length(agenda) between 1 and 50),
  targets uuid[] not null default '{}',
  room text not null unique,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists work_dives_team on public.work_dives (team_id, created_at desc);

-- join: in the call (or was), kakao: "카톡 가능", busy: "지금 연락 불가", left: was in the call and left.
create table if not exists public.work_replies (
  dive_id uuid not null references public.work_dives(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer text not null check (answer in ('join', 'kakao', 'busy', 'left')),
  at timestamptz not null default now(),
  primary key (dive_id, user_id)
);

alter table public.work_teams enable row level security;
alter table public.work_members enable row level security;
alter table public.work_presence enable row level security;
alter table public.work_dives enable row level security;
alter table public.work_replies enable row level security;

-- Which of these emails already have an account (to push them the invite). Only the function may call it.
create or replace function public.work_user_ids(emails text[])
returns table (email text, id uuid) language sql security definer set search_path = '' as $$
  select lower(u.email)::text, u.id from auth.users u where lower(u.email) = any (emails)
$$;
revoke all on function public.work_user_ids(text[]) from public, anon, authenticated;
grant execute on function public.work_user_ids(text[]) to service_role;

-- 다이브를 전화처럼: the phone's VoIP push address (PushKit). A dive that picks the person is sent there and the
-- iPhone rings like a phone call. The phone writes its own (an upsert, so table-wide grants); the function reads.
create table if not exists public.voip_devices (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null,
  platform text,
  disabled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.voip_devices enable row level security;
drop policy if exists "own read" on public.voip_devices;
drop policy if exists "own write" on public.voip_devices;
drop policy if exists "own change" on public.voip_devices;
drop policy if exists "own remove" on public.voip_devices;
create policy "own read" on public.voip_devices for select to authenticated using (user_id = auth.uid());
create policy "own write" on public.voip_devices for insert to authenticated with check (user_id = auth.uid());
create policy "own change" on public.voip_devices for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own remove" on public.voip_devices for delete to authenticated using (user_id = auth.uid());
revoke all on public.voip_devices from anon, authenticated;
grant select, insert, update, delete on public.voip_devices to authenticated;

-- A dive is a room: empty_since is set when the last person leaves (cleared when someone comes in); a room empty
-- for 6 hours is ended by the function. Rooms open before this column existed count as empty since they were made.
alter table public.work_dives add column if not exists empty_since timestamptz;
update public.work_dives set empty_since = created_at where ended_at is null and empty_since is null;
