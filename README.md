# 할 일 체커 (todo-checklist)

팀/프로젝트 기반 메모형 할 일 관리 앱 — 크로스 플랫폼 모노레포.

```text
todo-checklist/
├─ desktop/   Electron + Vite + React (Windows 데스크톱, 트레이 상주·알림·구글 캘린더)
├─ mobile/    Expo React Native SDK 57 (iOS / Android)
└─ server/    동기화 서버 — 의존성 없는 Node 단일 파일 (데스크톱 ↔ 모바일 같은 할 일 공유)
```

## 실행

### 데스크톱

```sh
cd desktop
npm run dev     # 개발 (Vite + Electron)
npm start       # 빌드 후 실행
npm run dist    # Windows 설치본 생성 (release/할일체커-Setup-*.exe)
```

데이터: `%APPDATA%\할 일 체커\db.json` (설치본·개발 실행 공유)

### 모바일 (iOS / Android)

```sh
cd mobile
npm start       # Expo 개발 서버 → Expo Go 앱으로 QR 스캔 (iPhone/Android 공통)
npm run android # 안드로이드 에뮬레이터/기기
npm run ios     # iOS 시뮬레이터 (macOS 필요; 실기기는 Expo Go QR 스캔)
```

데이터: 기기 내 AsyncStorage (`todo-checker/db` 키, 데스크톱 db.json과 같은 스키마)

데스크톱과 같은 워크플로를 지원한다: 일/월 뷰 전환, 팀·프로젝트·채널 그룹 입력(이름 입력 또는 칩 선택 시 그룹 전환, 부분일치 자동완성),
여러 줄 붙여넣기(입력 줄의 📋 버튼 — 팀/프로젝트/채널 이름 줄은 그룹 전환으로 처리), 날짜 미정 목록, 버킷, 프로젝트 진행률.
스토어 배포용 식별자는 `com.todochecker.app` (app.json).

### 동기화 서버

```sh
cd server
npm start        # 기본 포트 8787. 첫 실행 시 토큰을 자동 생성해 출력 (data/token.txt에 보관)
```

- 의존성 없는 Node 18+ 단일 파일(`server/index.js`). `PORT`, `SYNC_TOKEN` 환경변수로 조정.
- 데스크톱 설정 → "동기화", 모바일 설정 → "동기화"에 **같은 주소·토큰**을 입력하면
  팀/프로젝트/할 일이 양쪽에서 합쳐진다 (settings·알림 로그는 기기별이라 동기화 안 함).
- 주소는 폰에서 접근 가능한 값이어야 한다 — 같은 Wi-Fi면 PC의 LAN IP (`ipconfig`의 IPv4, 예: `http://192.168.0.10:8787`).
  외부에서 쓰려면 HTTPS로 올린다 (Fly.io 한 방 배포 또는 Docker+Caddy — [server/DEPLOY.md](server/DEPLOY.md)).
  iOS는 평문 HTTP를 로컬 네트워크에서만 허용하므로, 집 밖에서 쓰려면 HTTPS가 사실상 필수다.
- 병합 규칙: 레코드별 last-write-wins(`updatedAt`), 삭제는 tombstone이 전파 (기기 시계 기준이므로 개인용 수준).
- 자동 동기화: 데스크톱은 시작 시 + 10분마다, 모바일은 앱을 켤 때. 수동은 각 설정 화면의 "지금 동기화".

## 배포

플랫폼별 상세 절차는 각 디렉터리의 `DEPLOY.md` 참고.

| 대상 | 가이드 | 상태 |
|---|---|---|
| 데스크톱 (Windows/macOS) | [desktop/DEPLOY.md](desktop/DEPLOY.md) | 빌드·자동 업데이트 준비됨. 코드 서명 인증서 필요 |
| 모바일 (iOS/Android) | [mobile/DEPLOY.md](mobile/DEPLOY.md) | EAS 설정 완료. `eas init` + 애플 계정 정보 입력 필요 |
| 동기화 서버 | [server/DEPLOY.md](server/DEPLOY.md) | Docker/Fly.io 구성 완료. HTTPS 권장 |

```sh
# 데스크톱 — Windows 설치본
cd desktop && npm run dist              # release/todo-checker-Setup-*.exe

# 데스크톱 릴리스 — 태그를 밀면 Actions 가 Win/macOS 빌드 후 GitHub Releases 에 게시
git tag v1.0.1 && git push --tags

# 모바일 — EAS 클라우드 빌드 (Windows 에서 iOS 빌드까지 가능)
cd mobile
npm i -g eas-cli && eas login && eas init
eas build -p ios --profile production
eas submit -p ios --latest              # TestFlight
```

데스크톱은 시작 시 + 6시간마다 GitHub Releases 를 확인해 자동 업데이트한다 (트레이 메뉴에서 수동 확인도 가능).

## 디자인

두 플랫폼 모두 같은 글래스모피즘 디자인 언어를 사용한다:
파스텔 그라데이션 배경 + 떠다니는 블롭, 반투명 유리 패널(blur), 인디고→바이올렛 액센트(#6366f1 → #8b5cf6),
스프링 애니메이션(체크 팝, 카드 등장, 팝업 전환).

데스크톱은 배경 테마 6종을 지원한다 (설정 → 테마, `settings.theme`에 저장):
라이트 / 다크 / 스페이스(별 반짝임) / 아날로그(종이 질감) / 오로라(흐르는 커튼) / 선셋.
색은 전부 `desktop/src/styles.css`의 CSS 변수 토큰으로 정의되며, 테마는 `[data-theme]` 블록이 토큰을 덮어쓰는 방식.
테마 목록/미리보기는 `desktop/src/themes.js`. 모바일 테마 이식은 TODO.

## 데이터 스키마 (공통)

`teams / projects / todos / tombstones / settings` — 자세한 필드는 `desktop/electron/store.cjs`의 DEFAULTS 참고.
mobile은 동일 스키마를 AsyncStorage에 저장. 레코드마다 `updatedAt`, 삭제는 `tombstones`에 기록해 server/가 병합한다.

## TODO (로드맵)

- **프로젝트 중심 할 일 채우기** — 프로젝트를 만들고 그 안에서 단계별로 할 일을 쪼개 넣는 플로우 (스키마는 준비됨, `desktop/electron/store.cjs` 주석 참고)
- **동기화 고도화** — 지금은 전체 상태 교환(LWW). 데이터가 커지면 변경분만 주고받는 방식·HTTPS 배포 가이드 추가
- **LLM 문서 분석** — 문서/서류 업로드 → LLM이 분석해 할 일 리스트로 변환. `sources` 컬렉션 + `todos.sourceId` + 'suggested' 상태로 확장 예정 (store.cjs 주석에 스키마 초안)
- 모바일: 테마 6종 이식, 알림(expo-notifications — Expo Go는 안드로이드 로컬 알림 미지원이라 dev build 필요), 구글 캘린더 연동
