# 할 일 체커 (todo-checklist)

팀/프로젝트 기반 메모형 할 일 관리 앱 — 크로스 플랫폼 모노레포.

```text
todo-checklist/
├─ desktop/   Electron + Vite + React (Windows 데스크톱, 트레이 상주·알림·구글 캘린더)
└─ mobile/    Expo React Native SDK 57 (iOS / Android)
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

### 모바일

```sh
cd mobile
npm start       # Expo 개발 서버 → Expo Go 앱으로 QR 스캔
npm run android # 안드로이드 에뮬레이터/기기
```

데이터: 기기 내 AsyncStorage (`todo-checker/db` 키, 데스크톱 db.json과 같은 스키마)

## 디자인

두 플랫폼 모두 같은 글래스모피즘 디자인 언어를 사용한다:
파스텔 그라데이션 배경 + 떠다니는 블롭, 반투명 유리 패널(blur), 인디고→바이올렛 액센트(#6366f1 → #8b5cf6),
스프링 애니메이션(체크 팝, 카드 등장, 팝업 전환).

데스크톱은 배경 테마 6종을 지원한다 (설정 → 테마, `settings.theme`에 저장):
라이트 / 다크 / 스페이스(별 반짝임) / 아날로그(종이 질감) / 오로라(흐르는 커튼) / 선셋.
색은 전부 `desktop/src/styles.css`의 CSS 변수 토큰으로 정의되며, 테마는 `[data-theme]` 블록이 토큰을 덮어쓰는 방식.
테마 목록/미리보기는 `desktop/src/themes.js`. 모바일 테마 이식은 TODO.

## 데이터 스키마 (공통)

`teams / projects / todos / settings` — 자세한 필드는 `desktop/electron/store.cjs`의 DEFAULTS 참고.
mobile은 동일 스키마를 AsyncStorage에 저장하며, 추후 두 플랫폼 간 동기화를 붙일 수 있도록 맞춰둠.

## TODO (로드맵)

- **프로젝트 중심 할 일 채우기** — 프로젝트를 만들고 그 안에서 단계별로 할 일을 쪼개 넣는 플로우 (스키마는 준비됨, `desktop/electron/store.cjs` 주석 참고)
- **동기화 서버** — 데스크톱 ↔ 모바일이 같은 할 일을 공유하도록 경량 서버 배포. 현재는 양쪽 다 같은 스키마의 로컬 JSON. updatedAt/soft-delete만 추가하면 병합 가능하게 설계해둠
- **LLM 문서 분석** — 문서/서류 업로드 → LLM이 분석해 할 일 리스트로 변환. `sources` 컬렉션 + `todos.sourceId` + 'suggested' 상태로 확장 예정 (store.cjs 주석에 스키마 초안)
- 모바일: 테마 6종 이식, 월 뷰, 알림(expo-notifications), 구글 캘린더 연동
