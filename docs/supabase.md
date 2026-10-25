# Supabase 연결

PC 앱, 휴대폰 앱, 도구 연결 서버가 모두 같은 Supabase DB와 직접 동기화합니다. 휴대폰이 PC와 같은 Wi-Fi에 있지 않아도 됩니다. 화면에는 Supabase 관련 설정이 없고, 아래 파일에 키를 넣으면 자동으로 켜집니다.

## 1. 프로젝트 만들기

1. <https://supabase.com> 에 로그인 → **New project**.
2. 이름과 DB 비밀번호를 정하고, 지역은 **Northeast Asia (Seoul)** 를 고릅니다.

## 2. 테이블 만들기

1. 프로젝트 → **SQL Editor** → **New query**.
2. 저장소의 [`supabase/schema.sql`](../supabase/schema.sql) 내용을 전부 붙여 넣고 **Run**.
3. **Table Editor**에 `teams`, `projects`, `todos` 세 테이블이 보이면 끝입니다. 여러 번 실행해도 안전합니다.

| 테이블 | 담는 것 |
|---|---|
| `teams` | 팀 (이름, 색, 중요 표시) |
| `projects` | 프로젝트 (`status = 'bucket'`이면 프로젝트 버킷) |
| `todos` | 할 일 (`status`가 `todo` · `done` · `bucket`, `bucket`이 할 일 버킷) |

모든 행에 `updated_at`(마지막 수정, 기기 시각 ms)과 `deleted_at`(삭제 시각)이 있습니다. 같은 항목을 두 기기에서 고치면 나중에 고친 쪽이 이기고, 삭제도 다른 기기로 전파됩니다.

## 3. 키 복사

프로젝트 → **Project Settings → API** (또는 상단 **Connect**)에서 두 값을 복사합니다.

- **Project URL**: `https://xxxxxxxx.supabase.co`
- **Publishable key** (`sb_publishable_...`, 예전 이름은 anon) — PC·휴대폰 앱용
- **Secret key** (`sb_secret_...`, 예전 이름은 service_role) — 서버 전용. 앱에는 절대 넣지 않습니다.

## 4. 키 넣기

| 어디 | 파일 | 내용 |
|---|---|---|
| PC 앱 | `desktop/.env` | `SUPABASE_URL=...`<br>`SUPABASE_ANON_KEY=...` (publishable 키) |
| 휴대폰 앱 | `mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL=...`<br>`EXPO_PUBLIC_SUPABASE_ANON_KEY=...` (publishable 키) |
| 도구 연결 서버 (선택) | `server/.env` | `SUPABASE_URL=...`<br>`SUPABASE_KEY=...` (secret 키) |

각 폴더의 `.env.example`을 복사해서 쓰면 됩니다. `.env`는 git에 올라가지 않습니다.

- PC 앱: `npm start`로 실행하면 바로 적용됩니다. 설치 파일(`npm run dist`)을 만들 때는 `.env`의 값이 앱 안(`electron/supabase.json`)에 자동으로 포함됩니다.
- 휴대폰 앱: Expo가 빌드할 때 값을 앱에 넣습니다. 키를 바꾸면 `npx expo start -c`로 다시 시작하거나 다시 빌드합니다.
- 도구 연결 서버: Notion·Google·Apple 캘린더 연결은 이 서버가 처리합니다. 서버에도 키를 넣어야 도구에서 가져온 할 일이 휴대폰까지 전달됩니다.

동기화는 앱이 켜져 있는 동안 5초마다, 그리고 할 일을 고친 직후에 일어납니다.

## 보안 주의

지금은 로그인 없이 publishable 키로 읽고 씁니다. **키를 아는 사람은 누구나 데이터를 읽고 쓸 수 있습니다.** 키를 공개 저장소·메신저에 올리지 마세요. 로그인을 붙일 때는 각 테이블에 `user_id` 열을 추가하고 `schema.sql`의 정책을 `auth.uid()` 기준으로 바꾸면 됩니다.

## 확인

```powershell
cd desktop
npm run test:sync     # 동기화 엔진 (가짜 Supabase로 두 기기 수렴 확인)
cd ../server
npm test              # 서버가 Supabase와 주고받는지 포함
```

Supabase 대시보드 **Table Editor → todos**에서 앱에서 쓴 할 일이 몇 초 안에 보이면 연결된 것입니다.
