# 데스크톱 배포 (Windows / macOS)

## 현재 상태

- Windows NSIS 설치본 빌드 가능 (`npm run dist`)
- 자동 업데이트 배선 완료 — `electron/updater.cjs`, 시작 시 + 6시간마다 확인, 트레이 메뉴에 "업데이트 확인"
- GitHub Releases 를 배포처로 사용 (`package.json` → `build.publish`)
- macOS 타깃 설정 완료. 단 **빌드에는 macOS 머신이 필요**하므로 GitHub Actions 로 처리한다

## 릴리스 절차

```sh
# 1) 버전 올리기 (자동 업데이트는 이 버전을 비교한다)
npm version 1.0.1 --prefix desktop --no-git-tag-version
git commit -am "desktop 1.0.1"

# 2) 태그를 밀면 Actions 가 Windows/macOS 를 빌드해 Releases 에 올린다
git tag v1.0.1
git push && git push --tags
```

`.github/workflows/desktop-release.yml` 이 두 OS 러너에서 빌드하고 `--publish always` 로 업로드한다.
같이 올라가는 `latest.yml`(win) / `latest-mac.yml`(mac) 을 설치된 앱이 읽어 자동 업데이트한다.

> Release 를 **draft 가 아닌 published** 상태로 만들어야 기존 사용자에게 업데이트가 내려간다.
> Actions 가 만든 draft 를 GitHub UI 에서 Publish 하면 된다.

로컬에서 Windows 만 내보내려면:

```sh
npm run dist          # release/todo-checker-Setup-1.0.0.exe
npm run release       # 빌드 + GitHub Releases 업로드 (GH_TOKEN 환경변수 필요)
```

> 설치 파일명이 ASCII(`todo-checker-Setup-*.exe`)인 이유: electron-builder 가 자동 업데이트용
> `latest.yml` 에 파일명을 적을 때 비ASCII 문자를 치환해 버려서, 한글 파일명을 쓰면
> 업데이터가 없는 URL 을 받아 조용히 실패한다. 사용자에게 보이는 앱 이름·바로가기는 "할 일 체커" 그대로다.

## 코드 서명

미서명 상태로도 배포는 되지만 설치 시 경고가 뜬다. 서명하면 사라진다.

### macOS — Apple Developer 계정으로 지금 가능

App Store 밖으로 배포하는 앱은 **Developer ID Application** 인증서가 필요하다 (이미 보유한 연 $99 멤버십에 포함).

1. [Certificates](https://developer.apple.com/account/resources/certificates/list) → **Developer ID Application** 생성
2. 키체인에서 `.p12` 로 내보내고 base64 인코딩:
   `base64 -i cert.p12 | pbcopy`
3. GitHub 저장소 Secrets 에 등록:

   | Secret | 값 |
   |---|---|
   | `CSC_LINK` | 위 base64 문자열 |
   | `CSC_KEY_PASSWORD` | `.p12` 내보낼 때 정한 비밀번호 |
   | `APPLE_ID` | 애플 계정 이메일 |
   | `APPLE_APP_SPECIFIC_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) → 앱 암호 생성 |
   | `APPLE_TEAM_ID` | 10자리 팀 ID |

공증(notarization)은 `package.json` 의 `mac.notarize: true` 설정으로 빌드 중 자동 수행된다.
Secrets 가 없으면 미서명으로 빌드된다 (실행 시 "확인되지 않은 개발자" 경고).

### Windows — 별도 인증서 필요

애플 인증서는 쓸 수 없다. Sectigo/DigiCert 등에서 코드 서명 인증서를 따로 구입해야 한다
(OV 약 $200~400/년, EV 는 더 비싸지만 SmartScreen 평판이 즉시 붙는다).
구입 후 `.pfx` 를 위와 같은 방식으로 `CSC_LINK` / `CSC_KEY_PASSWORD` Secrets 에 넣으면 워크플로가 바로 사용한다.

**서명 없이 배포할 경우**: 설치 시 SmartScreen 이 "알 수 없는 게시자" 경고를 띄운다.
사용자가 "추가 정보 → 실행"을 눌러야 한다. 다운로드 수가 쌓이면 경고 빈도가 줄지만 완전히 사라지진 않는다.

## 자동 업데이트 동작

| 시점 | 동작 |
|---|---|
| 앱 시작 직후, 이후 6시간마다 | 조용히 확인 → 새 버전이면 백그라운드 다운로드 |
| 다운로드 완료 | "지금 재시작 / 나중에" 대화상자 |
| "나중에" 선택 | 다음 앱 종료 때 자동 설치 (`autoInstallOnAppQuit`) |
| 트레이 → 업데이트 확인 | 수동 확인, 최신이면 그렇다고 알려준다 |

개발 실행(`npm run dev`)에서는 `app.isPackaged` 가 false 라 업데이트를 확인하지 않는다.

## 데이터 위치

`%APPDATA%\할 일 체커\db.json` (Windows) — 설치본과 개발 실행이 공유한다.
업데이트해도 유지되며, 제거 시에는 남는다.
