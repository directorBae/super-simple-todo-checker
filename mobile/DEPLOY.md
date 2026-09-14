# 모바일 배포 (iOS TestFlight / App Store, Android)

Windows에서 iPhone용 네이티브 빌드는 **EAS 클라우드 빌드**를 사용한다. 활성 Apple 개발자 멤버십과 서명 설정이 필요하다.

**PC + iPhone 데모 촬영은 [데모 빌드·설치 가이드](../docs/demo-build-install.md)를 따른다.** `demo` 프로필은 등록한 iPhone에 설치하는 Ad Hoc Release 빌드다. 먼저 Expo 로그인, 프로젝트 연결, iPhone 등록을 완료한 뒤 `npm run build:demo:ios`를 실행한다.

## 0. 남은 수동 작업 (이것만 채우면 빌드 가능)

| 항목 | 어디서 | 방법 |
|---|---|---|
| `extra.eas.projectId` | `app.json` | `eas init`이 자동으로 채운다 (2단계) |
| `appleId` / `ascAppId` / `appleTeamId` | `eas.json` → `submit.production.ios` | `REPLACE_WITH_...` 3개를 실제 값으로 (4단계) |
| 개인정보 처리방침 URL | App Store Connect | 필수. 정적 페이지 하나면 충분 (아래 참고) |

## 1. eas-cli 설치 · 로그인

```sh
npm i -g eas-cli
eas login          # Expo 계정 (무료, 애플 계정과 별개)
eas whoami
```

## 2. EAS 프로젝트 연결

```sh
cd mobile
eas init           # app.json 에 extra.eas.projectId 와 owner 를 써넣는다
```

## 3. 빌드

```sh
# 내부 테스트용 (안드로이드 APK / iOS ad-hoc)
eas build -p android --profile preview

# 스토어 제출용
eas build -p ios --profile production        # .ipa
eas build -p android --profile production    # .aab
```

iOS 첫 빌드에서 애플 로그인을 요구한다. **인증서·프로비저닝 프로파일은 EAS가 자동 생성**하므로
Apple 팀과 기존 인증서를 확인해서 생성/재사용 여부를 선택한다. Apple Developer Program 멤버십이 활성 상태여야 한다.

버전은 `eas.json`의 `appVersionSource: "remote"` + `autoIncrement: true` 설정에 따라
**EAS 서버가 빌드 번호를 자동 증가**시킨다. `app.json`의 `version`(1.0.0)은 마케팅 버전이라
기능 릴리스마다 직접 올린다.

## 4. App Store Connect 등록 · 제출

1. [App Store Connect](https://appstoreconnect.apple.com)에서 앱 레코드 생성
   - 번들 ID `com.todochecker.app` (Developer 포털에 먼저 등록되어 있어야 함 — EAS 첫 빌드가 만들어 준다)
   - 생성 후 URL의 숫자 ID가 `ascAppId`
2. `eas.json`의 `submit.production.ios` 3개 값 채우기
   - `appleTeamId`: [Developer 멤버십 페이지](https://developer.apple.com/account#MembershipDetailsCard)의 Team ID (10자리)
3. 제출

```sh
eas submit -p ios --latest      # 마지막 production 빌드를 App Store Connect 로 업로드
```

업로드 처리와 필요한 정보를 완료한 뒤 TestFlight에서 내부 테스터 그룹에 빌드를 배정한다. 처리 시간은 상황에 따라 달라진다.

## 5. 심사 제출 전 체크리스트

- [ ] **개인정보 처리방침 URL** — 실제 서버와 Notion·Google·Apple·OpenAI로 전달하는 업무 내용, 개인 메모리 저장과 삭제 방식을 설명한다.
- [ ] **앱 개인정보 보호(App Privacy)** — 실제 배포 방식과 데이터 흐름에 따라 작성한다. 일괄적으로 "데이터를 수집하지 않음"이라고 신고하지 않는다.
- [x] **수출 규정** — `ios.config.usesNonExemptEncryption: false` 설정됨. 업로드마다 묻지 않는다.
- [x] **ATS** — `NSAllowsLocalNetworking`으로 축소됨 (전면 해제 아님). 서버를 HTTPS로 배포하면
      이 예외 없이도 동작한다 → `../server/DEPLOY.md`
- [x] **로컬 네트워크 권한 설명** — `NSLocalNetworkUsageDescription` 설정됨
- [x] **아이콘** — 1024×1024, 알파 채널 없음
- [ ] **심사 메모(App Review Notes)** — 아래 문구를 넣어두면 리뷰어의 "서버가 필요한가?" 질문을 예방한다:

  > 기본 업무 편집은 오프라인에서 동작합니다. 기기 간 동기화, 외부 도구 연동과 AI 기능은 서버 설정이 필요합니다.
  > 리뷰어에게 사용할 수 있는 테스트 서버와 계정, 각 기능의 확인 절차를 별도로 제공합니다.

- [ ] 스크린샷 — 6.7"(iPhone 15/16 Pro Max) 필수. 시뮬레이터 캡처로 충분.

## Android (Google Play)

```sh
eas build -p android --profile production    # .aab 생성
```

Play Console 등록($25 1회) 후 `.aab`를 직접 업로드하거나,
서비스 계정 키를 만들어 `eas.json`의 `submit.production.android.serviceAccountKeyPath`에 연결하면
`eas submit -p android`로 자동화된다.

## 참고

- `expo-updates`를 쓰지 않으므로 EAS Update(OTA) 채널 설정은 빼두었다.
  나중에 코드 푸시가 필요해지면 `npx expo install expo-updates` 후 `eas.json`에 `channel`을 추가한다.
- 개발 빌드(`expo-dev-client`)는 알림 등 Expo Go에서 안 되는 기능을 실기기로 볼 때 필요하다:
  `npx expo install expo-dev-client` 후 `eas.json`에 `development` 프로필을 추가한다.
