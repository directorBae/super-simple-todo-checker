# 조직별 양방향 TODO 통합 설계

상태: 초기 설계 기록. 개인용 로컬 SQLite 서버와 Notion·Google·iCloud·OpenAI 연결을 구현했다. 실제 설정과 지원 범위는 [연결 가이드](integration-setup.md)를 따른다. 아래 데이터 모델은 초기 제안으로, 현재 구현은 server/lib/에 있다. 콘텐츠 캘린더는 제거했으며 기존 항목은 일반 할 일로 이관한다.

## 요구사항

Notion, Google Calendar, Apple Calendar에서 일을 가져와 조직별로 관리하고, 앱에서 만든 일은 OpenAI API로 분류해 해당 조직의 적절한 도구에 생성한다. 앱과 외부 도구의 수정은 같은 항목에 반영한다.

- Notion: 워크스페이스 연결 → 데이터베이스/데이터 소스 선택 → 제목·날짜·상태 속성 매핑 → 조직 지정 → 가져오기.
- Google Calendar: 계정 연결·선택 → 캘린더 선택 → 조직 지정 → 가져오기. 복수 계정과 복수 캘린더를 지원한다.
- Apple Calendar: 지원하는 연결 방식에 맞는 계정/캘린더 선택 → 조직 지정 → 가져오기.
- 조직별로 가져올 위치, 업무용 Notion 기본 위치, 미팅용 기본 캘린더를 설정한다.
- 새 일의 조직·종류·날짜·시간을 해석해 목적지에 기록한다. Google과 Apple을 모두 연결해도 기본 목적지 한 곳에 생성한다.
- 각 TODO에 최초 출처, 연결된 원본, 전송 상태를 표시한다.
- Notion에서 가져온 일의 워딩을 바꾸면 같은 페이지를 수정한다. 제목을 동일성 판단의 기준으로 사용하지 않는다.

## 현재 코드와 변경 지점

| 위치 | 현재 동작 | 필요한 변경 |
| --- | --- | --- |
| desktop/electron/gcal.cjs | 단일 계정의 primary 캘린더 읽기 | 계정·캘린더 선택, 쓰기 권한, 원본 수정 |
| desktop/electron/store.cjs | todos와 gcalEvents 별도 저장 | 통합 TODO와 출처·외부 링크 |
| desktop/electron/main.cjs | 로컬 CRUD와 Google IPC | 변경 명령 기록, 연결 관리, 작업 상태 수신 |
| desktop/src/views/Settings.jsx | Google 읽기 전용 설정 | 도구별 연결 화면, 대상·조직 매핑 |
| mobile/src/store.js | 로컬 CRUD와 전체 상태 동기화 | 동일 모델, 변경 명령, 작업 상태 |
| server/index.js | 공유 토큰 기반 전체 상태 LWW 병합 | 연결·분류·전송 작업, 버전 검증 |

기존 teams/teamId를 조직으로 활용한다. 현재 팀은 데이터 분류이며 사용자별 접근 제어가 아니다. 여러 사용자가 조직을 공유하려면 사용자 인증과 조직 멤버십 검증이 추가로 필요하다.

## 데이터 모델 제안

기존 TODO 필드는 유지한다. kind: todo|content는 화면 구분용이므로 AI 업무 종류와 분리한다.

| 모델 | 주요 필드 | 역할 |
| --- | --- | --- |
| todos | 기존 필드 + taskType, origin, schedule, revision | 안정적인 내부 ID를 갖는 통합 항목 |
| connections | id, provider, accountId, accountLabel, credentialRef, status | 외부 계정과 서버 전용 인증 정보 참조 |
| integrationTargets | id, connectionId, containerId, teamId, readEnabled, writeEnabled, propertyMapping | 선택한 데이터 소스/캘린더와 조직 연결 |
| externalLinks | id, todoId, targetId, externalId, remoteVersion, lastSyncedRevision, baseSnapshot, syncState | 원본 식별과 마지막 동기화 기준 |
| routingPolicies | teamId, taskType, defaultTargetId, enabled | 조직별 자동 분배 설정 |
| routingDecisions | todoId, revision, targetId, taskType, reason, model, policyVersion, status | 분배 근거와 적용 입력 버전 |
| syncJobs | id, todoId, targetId, operation, revision, idempotencyKey, state, attempts, nextAttemptAt, lastError | 재시작 후 복구 가능한 전송 작업 |

origin은 최초 생성 경로를 보존한다. 앱 생성은 type: app과 deviceId, 외부 수집은 type: external과 provider/connectionId/containerId/externalId를 기록한다. 출처를 확인할 수 없는 기존 데이터는 legacy로 이관하며 자동 일괄 전송하지 않는다.

외부 항목의 식별 키는 (connectionId, containerId, externalId)다. 대상 설정을 다시 만들거나 계정을 재인증해도 동일 공급자 계정의 연결과 원본 관계를 복구해야 한다. 초기 버전은 TODO당 자동 쓰기 목적지를 하나로 제한하되, 모델은 복수 링크를 수용한다.

schedule은 unscheduled | all_day | timed를 구분하고 시작·종료 날짜, 시각, IANA 시간대를 저장한다. 기존 date/startTime/endTime과의 변환은 공통 함수에서 처리한다. 반복 일정은 시리즈와 발생 건의 식별 정보를 보존한다.

원본 ID·revision·작업 상태는 서버 소유 필드다. 클라이언트의 임의 patch나 오래된 전체 상태가 이를 덮어쓰지 못하게 허용 필드와 병합 규칙을 둔다. 외부 계정 토큰과 OpenAI API 키는 /sync, /db, Electron renderer 상태로 전달하지 않는다.

## 생성·수정 흐름

앱 저장 → 변경 명령 기록 → 서버에서 중복·버전 확인 → 기존 원본 연결 확인 → 신규일 때 조직·AI 분류 → 목적지 검증 → 전송 작업 저장 → 외부 실행 → 원본 ID·동기화 기준 저장.

1. 앱은 네트워크와 AI 응답을 기다리지 않고 TODO와 고유 mutationId의 변경 명령을 로컬에 저장한다.
2. 서버가 명령 재전송을 중복 제거한다. 데스크톱과 모바일이 각각 같은 외부 create를 실행하지 않는다.
3. 기존 외부 링크가 있으면 그 원본을 수정한다. 제목이나 업무 종류 변경을 이유로 자동 복제하지 않는다.
4. 신규 앱 항목은 사용자가 지정한 조직을 우선한다. 미지정이면 허용된 조직 내에서 추론하고 애매하면 미분류로 보관한다.
5. 사용자 지정 목적지 → 조직 규칙 → AI 선택 순으로 적용한다. AI 후보는 해당 조직의 연결된 쓰기 가능 대상으로 제한한다.
6. 예: A 조직의 업무 마감은 A 조직 Notion, 미팅은 A 조직 기본 캘린더로 보낸다.
7. 자동 분배가 켜진 조직은 유효한 결과를 자동 실행한다. 미연결·권한 부족·필수 정보 부족은 TODO를 보존하고 이유를 표시한다.
8. TODO 변경과 전송 작업을 원자적으로 기록한다. 워커는 TODO/대상별로 직렬 실행하고 실행 직전 버전·연결·권한을 다시 확인한다.

외부 변경은 원본 ID로 같은 TODO를 갱신한다. cause: external_import를 기록해 신규 생성 파이프라인에 넣지 않으며, 메타데이터 갱신도 사용자 콘텐츠 수정과 구분한다.

## AI 계약과 날짜

OpenAI에는 업무 종류·일정 추출과 제한된 후보 중 목적지 선택을 맡긴다. Responses API의 text.format JSON Schema로 구조화된 결과를 받는 방식을 제안한다. 스키마 준수는 분류 정확성을 보장하지 않으므로 서버에서 검증하고 거부·불완전 응답은 실행하지 않는다. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

결과 필드: taskType, teamId, targetId, date, startTime, endTime, timeZone, needsReview, reason. 모호하거나 없는 값은 null로 표현한다. 모델명은 서버 설정으로 관리하고 실제 분류 사례로 평가한 뒤 선택한다.

- UI에서 지정한 조직·날짜·시간은 AI 추론보다 우선한다.
- 날짜는 있고 시간이 없으면 종일 일정으로 보낸다.
- 날짜 자체가 없으면 임의로 오늘에 넣지 않고 미정으로 보관한다.
- “내일”은 최초 입력 시각과 사용자의 시간대로 해석하고 결과를 저장한다. 다음 날 재시도해도 날짜가 바뀌지 않는다.
- 시작 시각만 있으면 설정된 기본 길이로 종료를 계산하고 적용 사실을 표시한다. 기본 설정도 없으면 보완 대기로 둔다.
- 자정을 넘는 종료 날짜, 서머타임, 여러 날 종일 일정의 왕복 변환을 검증한다.
- Google 일정의 종료는 배타적이므로 하루 종일 일정의 종료일은 다음 날짜다. [Google 이벤트 생성 규격](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- 모델에는 필요한 TODO와 후보 설정만 제공한다. 가져온 텍스트의 명령이 조직 범위·권한을 변경하지 못하게 한다.
- 입력 revision·정책 버전별 결과를 저장해 재시도 시 불필요한 재분류를 줄인다.

## 중복 방지와 충돌

| 상황 | 동작 |
| --- | --- |
| Notion 제목 수정 | 저장된 페이지 ID로 update. create 금지 |
| 반복 수집 | 원본 식별 키로 upsert. 내부 TODO ID 유지 |
| create 응답 유실 | 결과 불명으로 기록하고 원격 존재 확인. 무조건 create 재시도 금지 |
| 두 기기의 같은 명령 | mutationId와 서버 유일성 제약으로 중복 제거 |
| 전송 중 새 수정 | 성공한 입력 revision만 완료 처리하고 최신 수정은 후속 작업으로 유지 |
| 양쪽에서 같은 필드 수정 | 마지막 동기화 snapshot과 비교해 충돌 표시 |
| 양쪽의 서로 다른 필드 수정 | 지원 필드를 병합하고 새 기준 snapshot 저장 |
| 권한 회수·연결 해제 | 작업 중지, 재인증 필요 표시. 다른 조직으로 우회 전송 금지 |
| 원본 삭제 | 삭제된 링크 보존. 자동 재생성 금지 |
| 앱 삭제 | 내부 숨김과 외부 삭제를 구분. 외부 삭제 요청이면 원본 ID를 보존한 작업 실행 |
| 조직 변경 | 화면 조직 이동과 외부 원본 이동을 구분. 자동 복제 금지 |

생성 작업 키는 목적지와 내부 TODO를 기준으로 안정적으로 유지하고 수정 키는 revision을 포함한다. 작업과 링크는 트랜잭션 가능한 저장소로 관리한다. 현재 JSON 전체 상태 교환에 create 호출만 추가해서는 이 보장을 만들 수 없다.

Google은 생성 시 클라이언트가 이벤트 ID를 지정할 수 있으며 ID 형식·캘린더별 유일성 규칙을 준수해야 한다. [Google 이벤트 ID 규격](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)

공급자별 안정적인 ID 또는 앱 식별 메타데이터로 복구한다. Notion 등에서 결과 불명 create를 확실히 대조할 방법이 없으면 자동 재생성을 중지하고 복구 대상으로 표시한다. 외부 쓰기의 exactly-once를 가정하거나 제목 유사도로 동일성을 확정하지 않는다.

## 도구별 고려사항

Notion은 데이터베이스 아래 실제 data_source_id와 페이지 ID를 보존한다. 복수 데이터 소스가 있으면 추가 선택을 제공한다. 제목·날짜·상태 속성을 위치별로 매핑하고 이름 변경에 대비해 속성 ID를 저장한다. [Notion 데이터 소스](https://developers.notion.com/reference/data-source)

Google은 기존 읽기 전용 연결의 쓰기 동의 흐름을 추가한다. 실제 캘린더 쓰기 권한, 페이지네이션, 반복 발생 건, 취소·삭제, 증분 수집 기준을 처리한다. 캘린더에 없는 TODO 완료 상태를 일정 삭제로 바꾸지 않는다.

Apple은 우선 기기의 EventKit 접근을 제안한다. OS에 등록된 계정의 캘린더를 선택하고 기존 일정 읽기·갱신에 필요한 전체 접근 권한을 요청한다. [Apple EventKit 접근 권한](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)

EventKit 경로는 Apple 기기의 어댑터가 필요하다. 서버가 작업을 배정하고 기기가 실행·결과를 회신하며, 기기가 오프라인이면 대기로 표시한다. Windows에서 독립적인 iCloud 연결까지 필요하면 별도 iCloud/CalDAV 경로의 인증·기능 검증이 필요하다. 이 문서는 그 경로의 지원을 확정하지 않는다. Apple Calendar에 표시되는 Google 캘린더를 Google API로도 연결하면 같은 실체를 이중 수집할 수 있으므로 연결 대상을 조정한다.

## 구현 순서와 검증 기준

1. 공통 모델·마이그레이션, mutationId·revision, 서버 소유 메타데이터 보호, 영속 작업과 중복 제거.
2. 도구별 연결 화면, 조직 매핑, Notion 속성 매핑, Google 계정·캘린더 선택과 원본 수집.
3. 명시한 목적지에 생성·수정하는 양방향 쓰기, 충돌·삭제·재연결·실패 복구 검증.
4. OpenAI 자동 분배, 목적지·근거 표시, 정보 부족 보완. API 키와 OAuth 등록을 갖춘 개발 계정으로 통합 검증.
5. Apple 연결 범위 확정, 기기 작업 배정·복구, 데스크톱·모바일 상태 통합과 중복 연결 방지.

필수 시나리오:

- A 조직 미팅은 A 조직 캘린더 한 곳, 업무 마감은 A 조직 Notion에 생성된다.
- 날짜만 있으면 종일, 날짜가 없으면 미정이다.
- Notion 문구 수정 후 반복 동기화해도 페이지 수가 늘지 않는다.
- create 성공 후 응답 유실·서버 재시작·기기 재전송에도 무조건 새 항목을 만들지 않는다.
- 전송 중 수정, 동시 수정, 원본 삭제, 읽기 전용 대상, 재인증에도 원본 관계를 보존한다.
- 기존 TODO와 gcalEvents 이관 시 출처가 검증된 항목만 연결하고 대량 자동 전송하지 않는다.
- 오래된 클라이언트의 전체 상태가 출처·연결 정보를 지우지 못한다.
- 어댑터 테스트 통과와 실제 외부 계정 동작 확인을 구분해 기록한다.