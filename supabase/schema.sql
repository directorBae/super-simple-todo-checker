-- 체커 Supabase 스키마. Supabase 대시보드 → SQL Editor에 붙여 넣고 한 번 실행합니다.
-- 여러 번 실행해도 안전합니다.
--
-- 모델
--   teams     팀
--   projects  프로젝트 (status = 'bucket'이면 프로젝트 버킷)
--   todos     할 일 (status = 'todo' | 'done' | 'bucket' — 'bucket'이 할 일 버킷)
--
-- 공통 열
--   id          앱이 만든 문자열 ID
--   created_at  만든 시각 (기기 기준 ms)
--   updated_at  마지막 수정 시각 (기기 기준 ms) — 동기화는 이 값이 큰 쪽이 이깁니다
--   deleted_at  삭제 시각 (ms). 값이 있으면 삭제된 항목이며 다른 기기에 삭제를 전파합니다
--   synced_at   서버가 기록한 마지막 쓰기 시각 — 기기가 "이후 바뀐 것"만 가져올 때 씁니다

create table if not exists public.teams (
  id text primary key,
  name text not null default '',
  color text,
  important boolean,
  sort_order double precision,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint,
  synced_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  name text not null default '',
  team_id text,
  term text,
  status text,
  notes text,
  important boolean,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint,
  synced_at timestamptz not null default now()
);

create table if not exists public.todos (
  id text primary key,
  title text not null default '',
  notes text,
  date text,
  end_date text,
  start_time text,
  end_time text,
  time_zone text,
  team_id text,
  project_id text,
  status text not null default 'todo' check (status in ('todo', 'done', 'bucket')),
  sort_order double precision,
  important boolean,
  channel text,
  completed_at bigint,
  origin jsonb,
  extra jsonb not null default '{}'::jsonb,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint,
  synced_at timestamptz not null default now()
);

-- 서버 시계로 synced_at 갱신 (가져오기 기준)
create or replace function public.touch_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['teams', 'projects', 'todos'] loop
    execute format('drop trigger if exists %I_synced_at on public.%I', t, t);
    execute format('create trigger %I_synced_at before insert or update on public.%I for each row execute function public.touch_synced_at()', t, t);
    execute format('create index if not exists %I_synced_at_idx on public.%I (synced_at)', t, t);
  end loop;
end $$;

-- 로그인 전 단계의 열린 정책입니다. 로그인(auth.sql)을 켠 뒤 이 파일을 다시 실행했다면 auth.sql 1단계도 꼭 다시 실행하세요.
alter table public.teams enable row level security;
alter table public.projects enable row level security;
alter table public.todos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['teams', 'projects', 'todos'] loop
    execute format('drop policy if exists "app read" on public.%I', t);
    execute format('drop policy if exists "app insert" on public.%I', t);
    execute format('drop policy if exists "app update" on public.%I', t);
    execute format('create policy "app read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "app insert" on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "app update" on public.%I for update to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
