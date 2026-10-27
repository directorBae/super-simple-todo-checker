-- 로그인(이메일 + 비밀번호)과 사람별 데이터. schema.sql 다음에 Supabase 대시보드 → SQL Editor에서 한 번 실행합니다.
-- 여러 번 실행해도 안전합니다.
--
-- 바뀌는 것
--   · teams / projects / todos 의 모든 행에 주인(user_id)이 생깁니다. 앱이 새로 쓰는 행은 로그인한 사람으로 자동 기록됩니다.
--   · 로그인한 사람은 자기 행만 읽고 쓸 수 있습니다. 로그인하지 않은 접근(publishable 키만)은 아무것도 못 봅니다.
--   · 지금 있는 행(주인 없음)은 아래 2단계에서 첫 가입자에게 넘깁니다.

-- 1단계: 주인 열과 정책 ------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['teams', 'projects', 'todos'] loop
    execute format('alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade', t);
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
    execute format('create index if not exists %I_user_synced_idx on public.%I (user_id, synced_at)', t, t);

    execute format('drop policy if exists "app read" on public.%I', t);
    execute format('drop policy if exists "app insert" on public.%I', t);
    execute format('drop policy if exists "app update" on public.%I', t);
    execute format('drop policy if exists "own read" on public.%I', t);
    execute format('drop policy if exists "own insert" on public.%I', t);
    execute format('drop policy if exists "own update" on public.%I', t);
    execute format('create policy "own read" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "own update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- 2단계: 앱에서 처음 가입한 "뒤에" 아래만 따로 한 번 실행합니다 (지금 있는 할 일·팀을 첫 가입자에게).
-- do $$
-- declare owner uuid := (select id from auth.users order by created_at limit 1); t text;
-- begin
--   if owner is null then raise exception '먼저 앱에서 가입해 주세요.'; end if;
--   foreach t in array array['teams', 'projects', 'todos'] loop
--     execute format('update public.%I set user_id = $1 where user_id is null', t) using owner;
--   end loop;
-- end $$;
