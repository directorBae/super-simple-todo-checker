# Windows + iPhone + Android 데모 설치와 촬영

> 모바일 최신 버전은 1.1.2이며 PC 앱 없이 서버에 직접 로그인한다. [모바일 독립 시작 및 설치 안내](uiux-1.1.2.md)를 우선 확인한다. PC 앱은 1.1.1을 유지하며, 아래의 이전 모바일 설치 링크는 1.1.1 기준이다.

이 가이드는 2026-09-14 기준이다. Windows 설치 파일과 iPhone의 독립 실행 앱을 사용하고, 외부 API 연결과 동기화는 PC의 로컬 서버가 담당한다. 앱에 API 키를 넣지 않는다.

Google 개발 계정과 캘린더 계정의 구분, Apple 유료 멤버십 보유자를 위한 계정별 로그인 순서, EXE·APK·IPA의 내부 구성은 [계정과 설치 파일 상세 가이드](accounts-and-installers.md)를 참고한다.

## 파일과 현재 상태

- `todo-checker-demo-Setup-1.1.1.exe`: Windows x64 설치 파일. 데모 중 자동 업데이트를 실행하지 않는다. 유료 코드 서명 인증서는 적용하지 않았다.
- `todo-checker-demo-server-windows-x64.zip`: Windows용 Node 실행 파일과 서버 의존성을 포함한 로컬 서버. 별도 Node 설치 없이 실행한다. API 키와 개인 데이터는 포함하지 않는다.
- `todo-checker-demo-1.1.1-android.apk`: 서명된 Android Release 앱. Android 7.0 이상, 64비트 ARM 휴대폰과 x86_64 에뮬레이터용이다. Metro/Expo 개발 서버 없이 실행한다.
- `todo-checker-demo-1.1.1-ios.ipa`: Apple 서명된 Ad Hoc 설치 파일. 버전 1.1.1, 빌드 4, iOS 16.4 이상. 등록된 촬영용 iPhone 1대를 포함한다. [iPhone Safari에서 EAS 설치 페이지 열기](https://expo.dev/accounts/teamblco/projects/todo-checker/builds/b57eeefc-aadc-48c4-87d9-1f0d6e8f86cb). JavaScript 번들 또는 소스 ZIP은 iPhone 설치 파일이 아니다.

## 1. Apple 개발자 계정

이미 유료 Apple Developer Program 멤버십이 있으므로 다시 가입하거나 결제할 필요는 없다. [Apple Developer Account](https://developer.apple.com/account/)에 해당 멤버십을 보유한 Apple 계정으로 로그인해 활성 상태와 팀 이름·Team ID를 확인한다. 이후 EAS의 Apple 로그인에도 이 계정을 사용한다. Expo 로그인 계정은 별개다.

데모용은 **Ad Hoc 내부 배포**를 사용한다. 등록한 iPhone에 설치하며 App Store 공개 심사를 거치지 않는다. EAS가 생성할 배포 인증서와 프로비저닝 프로파일에 해당 기기의 UDID가 포함되어야 한다. [Expo 내부 배포 안내](https://docs.expo.dev/build/internal-distribution/)

Mac이 있으면 Xcode와 개인 Apple 계정으로 직접 기기에 개발 설치하는 경로도 있지만, 현재 Windows에서 EAS로 서명된 IPA를 만드는 절차는 활성 개발자 멤버십을 전제로 한다. 이 앱은 Expo SDK 57이다. App Store의 Expo Go는 SDK 54까지만 제공되므로 해당 앱을 설치하는 것만으로 지금 프로젝트를 실행할 수 없다. [Expo 공식 호환성 안내](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/)

## 2. Expo 로그인과 iPhone 등록

현재 저장소는 `teamblackcoconut` 사용자로 로그인하고 `teamblco` 조직의 [`todo-checker`](https://expo.dev/accounts/teamblco/projects/todo-checker)에 연결했다. 아래 로그인·초기화 명령은 이미 완료되어 있으므로 지금은 `device:create`부터 진행한다. Expo 조직과 Apple 개발자 팀은 별개이며, Apple 팀 선택 시 유료 멤버십의 팀을 선택한다.

[Expo](https://expo.dev/signup) 계정을 준비하고, PC 터미널에서 아래 명령을 순서대로 실행한다. Apple/Expo 비밀번호와 이중 인증 코드는 터미널 또는 공식 인증 화면에 직접 입력한다.

```powershell
cd "C:\Users\user\Desktop\배정원\Programming\todo-checklist\mobile"
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest init
npx eas-cli@latest device:create
```

`init`에서는 본인의 Expo 계정/프로젝트를 선택한다. `app.json`에 실제 `extra.eas.projectId`가 저장된다. `device:create`에서 Apple 팀을 선택하고 등록 URL/QR을 iPhone Safari로 열어 기기 등록을 완료한다. 안내되는 기기 등록용 프로파일을 설치한 뒤 CLI에서 등록 상태를 확인한다.

기존 번들 ID는 `com.todochecker.app`이다. 본인 Apple 팀에서 사용할 수 없다는 오류가 나오면 `app.json`의 `ios.bundleIdentifier`를 본인 소유의 고유한 값으로 변경해야 한다. 기존에 이 앱을 등록한 계정이면 같은 번들 ID와 팀을 유지한다.

## 3. iPhone 데모 빌드와 설치

현재 빌드는 완료됐다. 다시 빌드할 필요 없이 위 EAS 설치 페이지를 등록한 iPhone Safari에서 열고 **Install**을 선택한다. IPA의 앱 식별자·기기 포함 여부·번들 파일·압축 무결성을 확인했다. 실제 iPhone에서의 실행 확인은 설치 후 진행한다. 포함된 프로파일 만료는 한국 시간 2027-09-14 02:32이다. 아래 명령은 변경 후 재빌드할 때 사용한다.

```powershell
npm run build:demo:ios
```

이는 `eas build --platform ios --profile demo`를 실행한다. `demo` 프로필은 내부 배포용 Release 빌드이며 실제 iPhone을 대상으로 한다. Apple 인증 시 본인 팀을 선택하고, 인증서/프로비저닝 프로파일을 생성하거나 재사용한다. 생성 전에 등록한 iPhone이 포함되었는지 확인한다. EAS 계정의 사용 가능한 빌드 한도·대기열을 확인하며, 유료 플랜 결제는 별도로 판단한다.

완료된 EAS 빌드 페이지에서 `.ipa`를 다운로드할 수 있다. **iPhone Safari로 빌드 페이지의 설치 링크를 열어 설치**한다. IPA를 파일 앱에 복사하는 것만으로 설치되지는 않는다. 기기를 나중에 추가하면 해당 기기를 포함하도록 재빌드 또는 재서명이 필요하다.

iOS에서 개발자 모드를 요구하면 **설정 → 개인정보 보호 및 보안 → 개발자 모드**를 켜고 재부팅 후 확인한다. 처음에는 앱 설치를 시도해야 메뉴가 나타날 수 있다. 앱의 로컬 네트워크 접근 요청도 허용한다. [Expo iOS 개발자 모드 안내](https://docs.expo.dev/guides/ios-developer-mode/)

이 빌드는 Metro/Expo 개발 서버 없이 실행된다. 기기 간 동기화와 외부 연동에는 아래의 TODO 서버가 계속 실행되어 있어야 한다. TestFlight와 App Store Connect의 앱 등록은 이번 Ad Hoc 데모 설치에는 필요하지 않다.

## 4. Windows 앱과 로컬 서버 실행

지금 이 저장소의 `server/.env`에는 전달받은 OpenAI 키가 설정되어 있다. 프로젝트 루트에서 `cd server` 후 `npm start`로 실행하면 이 설정을 사용한다. 아래 ZIP 실행은 별도 배포본을 사용할 때의 방법이다.

1. Windows 설치 EXE를 실행한다. 서명되지 않은 로컬 데모 빌드라 Windows가 게시자를 확인할 수 없다는 안내를 표시할 수 있다.
2. 서버 ZIP을 압축 해제한다. 압축 파일 안에서 직접 실행하지 않는다.
3. 서버 폴더의 `.env.example`을 `.env`로 복사하고 API 설정을 입력한다. `start-server.cmd` 첫 실행에서도 빈 설정 파일을 복사한다.
4. `start-server.cmd`를 실행하고 촬영 중 창을 열어 둔다. 창을 종료하면 외부 연동과 기기 간 동기화도 멈춘다.
5. 첫 실행 후 생성되는 `data/token.txt`의 값을 PC 앱과 iPhone 앱의 **설정 → 동기화**에 같은 서버 토큰으로 입력한다. 토큰을 영상에 노출하지 않는다.

PC 앱의 서버 주소: `http://127.0.0.1:8787`

iPhone 앱의 서버 주소: `http://<PC의 Wi-Fi IPv4 주소>:8787`

PC와 iPhone을 같은 Wi-Fi에 연결하고 `ipconfig`에서 PC 주소를 확인한다. iPhone에 `localhost` 또는 `127.0.0.1`을 입력하면 PC 대신 iPhone 자신을 가리킨다. 게스트 Wi-Fi의 기기 간 통신 차단에도 주의한다. PC가 절전 상태에 들어가지 않게 촬영 전에 전원 설정을 확인한다.

Windows 방화벽에서 막히면 개인 네트워크 범위에만 TCP 8787 접근을 허용한다. 필요 시 **관리자 PowerShell**에서 다음을 실행한다. 이 명령은 문서 안내이며 자동 실행하지 않는다.

```powershell
New-NetFirewallRule -DisplayName 'Todo Demo Server' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8787 -Profile Private -RemoteAddress LocalSubnet
```

공유기의 포트 포워딩은 같은 Wi-Fi 데모에 필요하지 않다. iPhone Safari에서 `http://<PC IP>:8787/health`를 열어 연결을 확인한 뒤 두 앱에서 **지금 동기화**를 실행한다.

서버의 `data/` 폴더에는 업무, 개인 메모리, 연결 자격 증명과 암호화 키가 함께 보관된다. 기존 서버를 이미 쓰고 있다면 새 빈 서버를 만드는 대신 기존 서버를 사용하거나, 서버를 종료한 상태에서 `data/` 전체와 `.env`를 새 서버 폴더로 옮겨 사용한다. 동시에 두 서버를 실행하지 않는다.

## 5. 외부 API 준비

- Notion: 데모용 내부 연결 토큰을 발급하고 사용할 데이터베이스들에 연결을 추가한다. 앱에서 데이터베이스마다 조직을 지정한다.
- Google: Calendar API 활성화, 웹 OAuth 클라이언트 생성, 본인 계정 테스트 사용자 등록. 콜백을 `http://localhost:8787/oauth/google/callback`으로 등록하고 서버 `.env`에 Google 클라이언트 ID/Secret을 저장한다. Google 계정 연결은 PC 앱에서 먼저 진행한다.
- Apple Calendar: iCloud의 앱 전용 암호를 발급해 앱에서 연결한다. 캘린더 연결용 앱 암호와 iPhone 앱 서명용 개발자 멤버십은 서로 다른 용도다.
- OpenAI: API 키와 사용 결제를 준비하고 서버 `.env`에 키를 입력한다. 분류·중복 검사는 실제 API 사용량이 발생한다.

서버 `PUBLIC_URL=http://localhost:8787`은 OAuth 콜백 설정이다. iPhone 앱에 입력할 서버 주소는 위의 PC LAN 주소이며 서로 달라도 된다. 상세 절차는 [API 연결 가이드](integration-setup.md)를 따른다.

## 6. 촬영 순서

1. 촬영 전에 계정 연결과 토큰 입력을 완료하고 알림을 정리한다.
2. PC에서 회사/개인 조직과 조직별 여러 Notion DB를 보여 준다.
3. Notion 업무와 캘린더 일정을 가져온 뒤 iPhone에서 같은 업무가 보이는지 확인한다.
4. PC에서 날짜·시간이 있는 미팅을 추가하고 실제 캘린더에 들어간 모습을 보여 준다.
5. iPhone에서 업무를 수정하고 PC와 원본에 반영되는 모습을 보여 준다. 기본 동기화 간격은 약 15초이며 수동 동기화도 가능하다.
6. 다른 표현의 같은 업무를 비교해 병합하고 개인 메모리 기록을 보여 준다.
7. 다시 가져오기를 실행해 업무가 중복으로 늘어나지 않는 모습을 보여 준다.

PC 화면 녹화와 iPhone 제어 센터의 화면 기록을 각각 사용하면 된다. 영상 편집을 위해 두 화면에서 같은 동작을 한 번 보여 주면 시점을 맞추기 쉽다.

## 나중에 공개 배포할 때

TestFlight/App Store용은 `production` 프로필로 빌드한다. App Store Connect 앱 생성, 실제 제출 정보, 개인정보 처리방침과 앱 개인정보 항목, 심사용 계정/서버와 설명을 준비한다. 현재 앱은 Notion·Google·Apple·OpenAI로 업무 내용을 처리하므로 일괄적으로 “데이터를 수집하지 않음” 또는 “모든 기능이 서버 없이 동작함”이라고 신고하지 않는다. 실제 운영 데이터 흐름에 맞춰 작성한다. 사용자별 인증·연결 소유자 분리와 공개 OAuth 설정도 공개 서비스 전에 완료해야 한다.
