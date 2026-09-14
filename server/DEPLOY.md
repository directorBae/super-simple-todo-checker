# 동기화 서버 배포

로컬 TODO 편집은 서버 없이 가능하다. 외부 API 연동과 기기 간 동기화에는 서버가 필요하다. 개인 PC의 로컬 SQLite 파일에 저장하며 별도 DB 서버는 필요 없다.

[API 연결 가이드](../docs/integration-setup.md)를 먼저 따른다. 외부 호스팅은 선택 사항이다.

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

외부 변경 수집 워커가 계속 실행되도록 머신 자동 중지를 끈다.
호스팅 비용은 서비스의 현재 요금제를 확인한다.

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

첫 실행 시 토큰을 생성해 `data/token.txt`에 보관한다.
앱 설정에는 PC의 LAN IP를 넣는다 (`ipconfig`의 IPv4, 예: `http://192.168.0.10:8787`).
이 경우 iOS는 로컬 네트워크 접근 권한 팝업을 띄우며, app.json의 `NSAllowsLocalNetworking` 예외로 동작한다.

---

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8787` | 수신 포트 |
| `SYNC_TOKEN` | 자동생성 | 공유 인증 토큰. **배포 시 반드시 주입** (미주입 시 컨테이너 재생성마다 토큰이 바뀐다) |
| `DATA_DIR` | `./data` | SQLite와 암호화 키 저장 위치 |

## 운영 메모

- **백업**: 서버를 종료하고 data 폴더 전체를 복사한다. credentials.key도 함께 보관해야 계정 연결을 복구할 수 있다.
- **무차별 대입 차단**: 한 IP가 10분 안에 인증을 20번 실패하면 그 창 동안 429로 막는다.
  토큰을 잘못 넣어 잠겼다면 10분 기다리거나 서버를 재시작하면 풀린다.
- **로그**: 토큰과 계정 인증 정보는 출력하지 않는다.
- **인증 모델**: 단일 공유 토큰이고 사용자 구분이 없다. 토큰을 아는 사람은 전체 데이터를 읽고 쓴다.
  개인용이며, 여러 사용자에게 배포할 계획이면 계정 분리가 먼저다.
- **복구**: 서버를 종료하고 백업한 data 폴더를 복원한다. db.json은 SQLite 파일이 없을 때 최초 이관용으로만 읽는다.
