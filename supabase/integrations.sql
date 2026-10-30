-- 사람별 도구 연동(노션 · 구글 캘린더). auth.sql 다음에 SQL Editor에서 한 번 실행합니다. 여러 번 실행해도 안전합니다.
--
-- 흐름: 각자 앱에서 노션/구글을 연결(OAuth) → 노션은 페이지·DB를 골라 구독, 구글은 캘린더 전체 → 원본이 바뀌면
-- 웹훅이 Edge Function(sync-source)을 깨우고, GPT가 원본 전체와 이번 주 할 일을 비교해 할 일을 만들고 고친다.
-- 앱에서 날짜·시간을 바꾸면 todos 트리거가 Edge Function(push-back)을 불러 원본에도 반영한다(양방향).
--
-- 표
--   connections    사람별 연결. 토큰(secret)은 Edge Function만 읽는다 — 앱은 secret 열을 볼 수 없다.
--   subscriptions  구독한 노션 페이지·DB, 구글 캘린더. 웹훅 채널과 마지막 동기화 정보.
--   pet_jobs       펫이 하는 일(읽는 중 → 생각 중 → 적는 중 → 끝). 앱이 이걸 보고 펫 애니메이션을 띄운다.
--   webhook_keys   노션 웹훅 검증 토큰(서명 확인용). Edge Function만 쓴다.

create extension if not exists pg_net;

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('notion', 'google')),
  account text,                                 -- 노션 워크스페이스 이름 / 구글 이메일 (앱에 표시)
  meta jsonb not null default '{}'::jsonb,      -- 노션 workspace_id 등
  secret jsonb not null default '{}'::jsonb,    -- access/refresh token — 앱에는 안 보임
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  provider text not null check (provider in ('notion', 'google')),
  resource_type text not null check (resource_type in ('page', 'database', 'calendar')),
  resource_id text not null,
  title text not null default '',
  url text,
  meta jsonb not null default '{}'::jsonb,      -- 노션 DB의 제목·날짜 속성 이름, 구글 채널(id, resourceId, 만료)
  state text not null default 'idle',           -- idle | syncing | error
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider, resource_id)
);
create index if not exists subscriptions_resource_idx on public.subscriptions (provider, resource_id);
-- 한 구독은 한 번에 하나만 읽는다(syncing_since로 잡고, 그사이 온 웹훅은 pending으로 남겨 끝난 뒤 한 번 더).
alter table public.subscriptions add column if not exists pending boolean not null default false;
alter table public.subscriptions add column if not exists syncing_since timestamptz;

-- 여러 계정: 한 사람이 구글 계정(이메일)·노션 워크스페이스를 여러 개 연결할 수 있다. 구독은 연결(계정)마다.
alter table public.connections add column if not exists account_key text;
update public.connections set account_key = coalesce(meta->>'workspace_id', account, provider) where account_key is null;
alter table public.connections drop constraint if exists connections_user_id_provider_key;
create unique index if not exists connections_account_idx on public.connections (user_id, provider, account_key);
alter table public.subscriptions drop constraint if exists subscriptions_user_id_provider_resource_id_key;
create unique index if not exists subscriptions_connection_resource_idx on public.subscriptions (connection_id, resource_id);

create table if not exists public.pet_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null,
  kind text not null default 'import' check (kind in ('import', 'push')),
  state text not null default 'reading' check (state in ('reading', 'thinking', 'writing', 'done', 'error')),
  summary text not null default '',
  counts jsonb not null default '{}'::jsonb,    -- { created, updated, deleted }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pet_jobs_user_idx on public.pet_jobs (user_id, updated_at desc);

create table if not exists public.webhook_keys (
  provider text primary key,
  token text not null,
  created_at timestamptz not null default now()
);

-- 권한: 앱(로그인한 사람)은 자기 연결·구독·펫 작업을 읽고, 연결·구독을 지울 수 있다. 쓰기는 Edge Function(service role)만.
alter table public.connections enable row level security;
alter table public.subscriptions enable row level security;
alter table public.pet_jobs enable row level security;
alter table public.webhook_keys enable row level security;
do $$
declare t text;
begin
  foreach t in array array['connections', 'subscriptions', 'pet_jobs'] loop
    execute format('drop policy if exists "own read" on public.%I', t);
    execute format('drop policy if exists "own delete" on public.%I', t);
    execute format('create policy "own read" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['connections', 'subscriptions'] loop
    execute format('create policy "own delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
    execute format('grant delete on public.%I to authenticated', t);
  end loop;
end $$;
grant select (id, user_id, provider, account, account_key, meta, created_at) on public.connections to authenticated;
grant select on public.subscriptions, public.pet_jobs to authenticated;
revoke all on public.webhook_keys from anon, authenticated;

-- 양방향: 원본에서 온 할 일의 날짜·시간·제목·완료가 앱에서 바뀌면 push-back 함수를 부른다.
-- 함수 주소와 비밀값은 아래 설정 표에 둔다(대시보드에서 보이지 않게 Vault 대신 단순 표; service role만 읽음).
create table if not exists public.function_settings (key text primary key, value text not null);
alter table public.function_settings enable row level security;
revoke all on public.function_settings from anon, authenticated;

create or replace function public.todo_push_back() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; hook text;
begin
  if new.origin is null or new.origin->>'provider' is null then return new; end if;
  if new.deleted_at is not null and old.deleted_at is not null then return new; end if;
  if (new.date, new.start_time, new.end_time, new.title, new.status, new.deleted_at)
     is not distinct from (old.date, old.start_time, old.end_time, old.title, old.status, old.deleted_at) then return new; end if;
  select value into base from function_settings where key = 'functions_url';
  select value into hook from function_settings where key = 'hook_secret';
  if base is null or hook is null then return new; end if;
  perform net.http_post(
    url := base || '/push-back',
    body := jsonb_build_object('id', new.id, 'user_id', new.user_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Hook-Secret', hook)
  );
  return new;
end $$;
drop trigger if exists todos_push_back on public.todos;
create trigger todos_push_back after update on public.todos for each row execute function public.todo_push_back();

-- 아침 점검(월·목): 각자의 아침 알림 시간(앱이 적어 둔다) 15분 전, 알림이 꺼져 있으면 9시에 연결된 계정을 조용히 다시 읽는다.
create table if not exists public.user_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  morning_on boolean not null default true,
  morning_time text not null default '09:00',
  time_zone text,
  last_sweep date,
  updated_at timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
drop policy if exists "own read" on public.user_prefs;
drop policy if exists "own write" on public.user_prefs;
drop policy if exists "own change" on public.user_prefs;
create policy "own read" on public.user_prefs for select to authenticated using (user_id = auth.uid());
create policy "own write" on public.user_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "own change" on public.user_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.user_prefs from anon, authenticated;
grant select, insert, update (morning_on, morning_time, time_zone, updated_at, user_id) on public.user_prefs to authenticated;
grant select on public.user_prefs to authenticated;
-- 음악 재생목록(계정당 하나): [{ id, url, videoId, listId, title }] — 기기끼리 같은 목록을 본다.
alter table public.user_prefs add column if not exists playlist jsonb not null default '[]'::jsonb;
grant insert (playlist), update (playlist) on public.user_prefs to authenticated;

-- 폰 알림은 서버가 보낸다: 알림 시각이 되면 그때의 할 일로 문구를 만들어 푸시(Expo push)한다.
-- 폰을 열지 않고 데스크탑에서 고쳐도 폰 알림이 늘 최신이다. 알림 설정은 계정에 둔다(기기끼리 같다).
alter table public.user_prefs add column if not exists notify_start boolean not null default true;
alter table public.user_prefs add column if not exists notify_end boolean not null default true;
alter table public.user_prefs add column if not exists wrapup_on boolean not null default true;
alter table public.user_prefs add column if not exists wrapup_time text not null default '21:00';
grant insert (notify_start, notify_end, wrapup_on, wrapup_time), update (notify_start, notify_end, wrapup_on, wrapup_time) on public.user_prefs to authenticated;
-- 푸시를 받을 폰(로그인한 사람마다, 로그아웃하면 지운다).
create table if not exists public.push_devices (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null,
  platform text,
  disabled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.push_devices enable row level security;
drop policy if exists "own read" on public.push_devices;
drop policy if exists "own write" on public.push_devices;
drop policy if exists "own change" on public.push_devices;
drop policy if exists "own remove" on public.push_devices;
create policy "own read" on public.push_devices for select to authenticated using (user_id = auth.uid());
create policy "own write" on public.push_devices for insert to authenticated with check (user_id = auth.uid());
create policy "own change" on public.push_devices for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own remove" on public.push_devices for delete to authenticated using (user_id = auth.uid());
revoke all on public.push_devices from anon, authenticated;
grant select, insert, delete, update (platform, disabled_at, updated_at) on public.push_devices to authenticated;
-- 이미 보낸 알림(같은 알림은 한 번만). Edge Function만 쓴다.
create table if not exists public.push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;

-- 구글 웹훅 채널은 최대 일주일이라 매일 갱신한다(pg_cron). 대시보드 → Database → Extensions에서 pg_cron을 켠 뒤 실행됩니다.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('renew-google-channels', 'morning-sweep', 'push-reminders');
    -- 폰 알림: 1분마다 지금 울릴 알림을 찾아 보낸다.
    perform cron.schedule('push-reminders', '* * * * *', $cron$
      select net.http_post(
        url := (select value from public.function_settings where key = 'functions_url') || '/push',
        body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Hook-Secret', (select value from public.function_settings where key = 'hook_secret'))
      )
    $cron$);
    perform cron.schedule('morning-sweep', '*/10 * * * *', $cron$
      select net.http_post(
        url := (select value from public.function_settings where key = 'functions_url') || '/sweep',
        body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Hook-Secret', (select value from public.function_settings where key = 'hook_secret'))
      )
    $cron$);
    perform cron.schedule('renew-google-channels', '17 4 * * *', $cron$
      select net.http_post(
        url := (select value from public.function_settings where key = 'functions_url') || '/renew',
        body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Hook-Secret', (select value from public.function_settings where key = 'hook_secret'))
      )
    $cron$);
  end if;
end $$;
