# 동기화 서버 배포

앱은 로컬 우선(desktop=db.json, mobile=AsyncStorage)이라 **서버 없이도 완전히 동작한다.**
서버는 기기 간 공유가 필요할 때만 올리면 된다.

HTTPS가 필요한 이유: iOS는 ATS(App Transport Security) 때문에 평문 HTTP 접속에 예외 설정이 필요하고,
그 예외는 App Store 심사에서 소명을 요구받는다. 도메인+HTTPS로 올리면 이 문제가 통째로 사라진다.

---

## 방법 A — Fly.io (가장 빠름, 도메인 없이 HTTPS)

```sh
cd server
fly launch --no-deploy --copy-config --name <원하는-앱이름>
fly volumes create sync_data --size 1 --region nrt
fly secrets set SYNC_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
fly deploy
fly secrets list          # 토큰 값은 아래 명령으로 따로 보관해 둘 것
```

주소: `https://<앱이름>.fly.dev` — 앱 설정의 "서버 주소"에 이 값을 그대로 넣는다.

> 토큰은 `fly secrets set` 직후 화면에서 복사해 두자. Fly는 설정된 값을 다시 보여주지 않는다.
> 잊었다면 새로 발급(`fly secrets set SYNC_TOKEN=...`)하고 두 기기의 설정을 갱신하면 된다.

`auto_stop_machines = "suspend"` 라서 트래픽이 없으면 머신이 잠들고 요청이 오면 깨어난다.
개인용 규모에서는 무료 한도 안에서 돌아가고, 첫 요청만 1~2초 느리다.

## 방법 B — 자체 VPS + Caddy (도메인 보유 시)

```sh
# 1) DNS A 레코드로 도메인을 서버 IP에 연결
# 2) 설정 작성
cd server
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # SYNC_TOKEN 에 붙여넣기
# 3) 기동 — Caddy가 Let's Encrypt 인증서를 자동 발급/갱신한다
docker compose up -d
docker compose logs -f sync
```

주소: `https://<SYNC_DOMAIN>` (포트 불필요)

## 방법 C — 같은 Wi-Fi 안에서만 (배포 없음)

```sh
cd server && npm start
```

첫 실행 시 토큰을 생성해 출력하고 `data/token.txt`에 보관한다.
앱 설정에는 PC의 LAN IP를 넣는다 (`ipconfig`의 IPv4, 예: `http://192.168.0.10:8787`).
이 경우 iOS는 로컬 네트워크 접근 권한 팝업을 띄우며, app.json의 `NSAllowsLocalNetworking` 예외로 동작한다.

---

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8787` | 수신 포트 |
| `SYNC_TOKEN` | 자동생성 | 공유 인증 토큰. **배포 시 반드시 주입** (미주입 시 컨테이너 재생성마다 토큰이 바뀐다) |
| `DATA_DIR` | `./data` | db.json 저장 위치 |
| `TRUST_PROXY` | 없음 | `1`이면 `X-Forwarded-For`를 실제 IP로 신뢰. 리버스 프록시 뒤에서만 켤 것 |
| `BACKUP_KEEP` | `7` | db.json 일 단위 백업 보관 개수. `0`이면 백업 끔 |

## 운영 메모

- **백업**: 덮어쓰기 직전 원본을 하루 한 번 `data/db.YYYY-MM-DD.json`으로 복사하고 `BACKUP_KEEP`개만 남긴다.
  중요한 데이터라면 이 디렉터리를 외부로 주기 백업할 것.
- **무차별 대입 차단**: 한 IP가 10분 안에 인증을 20번 실패하면 그 창 동안 429로 막는다.
  토큰을 잘못 넣어 잠겼다면 10분 기다리거나 서버를 재시작하면 풀린다.
- **로그**: 인증 실패(401)와 동기화 성공만 stdout에 남는다. 토큰은 환경변수로 주입한 경우 로그에 찍지 않는다.
- **인증 모델**: 단일 공유 토큰이고 사용자 구분이 없다. 토큰을 아는 사람은 전체 데이터를 읽고 쓴다.
  개인/소규모 팀 전용이며, 여러 사용자에게 배포할 계획이면 계정 분리가 먼저다.
- **복구**: `data/db.json`을 백업 파일로 교체하고 재시작하면 된다. 클라이언트는 다음 동기화에서 서버 상태로 덮어쓴다.
