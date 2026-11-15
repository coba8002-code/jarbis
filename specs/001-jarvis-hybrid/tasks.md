# Tasks: JARVIS Hybrid 2.0

2026-11-13. 실제 수행한 것만 체크한다. 모의·Windows 검사와 Mac 실기를 구분한다.

## 준비 단계 기록 (기존)

- [x] T001 이전 대화 요구·파일 링크 확인. 실제 첨부 미확보 기록.
- [x] T002 D:/Codex, Downloads, Documents에서 원본 이름 검색.
- [x] T003 공식 Spec Kit 소스 고정·독립 도구 설치.
- [x] T004 Claude 연동·shell 스크립트로 프로젝트 초기화.
- [x] T005 Claude Code 설치·버전·로그인 상태 확인.
- [x] T006 현재 요청 기반 constitution/spec/plan/tasks 초안 작성.
- [ ] T007 원본 ZIP·MASTER_SPEC.md 확보, 해시·별도 해제·차이 기록.
- [x] T008 사용자 Claude 로그인 후 실제 개발 지시 실행. (2026-11-13 이 세션)
- [x] T009 인증 수단 확보 후 비공개 GitHub 저장소 생성. 커밋·푸시는 별도 요청 필요. — 2026-11-14 사용자가 저장소(coba8002-code/jarbis)를 만들고 요청해 첫 커밋·외부 접속 커밋을 푸시함(data/·.env.local·tools/whisper 제외 확인)
- [ ] T010 원본 스택 확정, 로컬 앱 실행 확인. (FR-001~010) — 1단계 잠정 스택은 T030~
- [x] T011 Mission 승인·거절·내용 변경·재시작·중복 방지 구현과 검사. (FR-006) — T040~T045로 세분화 (Windows·모의 실행기 검사 완료)
- [x] T012 기억 CRUD·삭제·복원·비밀 제외 구현과 검사. (FR-004,010) — T060~T063 (Windows 검사 완료)
- [x] T013 공급자 계약·모의 스트리밍·오류·취소 검사. (FR-005) — T070~T072 (모의만. 실제 API 아님)
- [ ] T014 승인된 실제 API와 Ollama 각각 검사. (FR-005,010) — Ollama는 T095 완료, 클라우드는 T096
- [ ] T015 Mac·Windows 각각 권한·한국어 STT/TTS 최소 대화 실행. (FR-001)
- [ ] T016 끼어들기·오래된 응답 차단 구현, 실기·지연 측정. (FR-002) — 로직은 T110~T111 완료, 실기는 T112
- [ ] T017 캐릭터 미리 보기·설정 복원·상태 연결·자산 이용 조건 확인. (FR-003) — 잠정 구현 T150~T154, 남은 것 T155·T156
- [x] T018 Quick Actions 승인·취소·실패 검사. (FR-007) — T050~T052 (모의 실행기만)
- [ ] T019 회의 시작/중지·원음·녹취·시간 탐색·삭제·오류 복구 검사. (FR-008) — 규칙은 T120~T122 완료, 실제 녹음은 T123
- [ ] T020 토스 프론트 식별·공식 문서 확인 후 구현·실기 검사. (FR-009)
- [ ] T021 Mac(M1 Max)·Windows PC 각각 장시간 대화·성능·권한·장치·연결 단절 QA. (SC-001~006)
- [ ] T022 실패 수정·재검사·제한·미검증·재개 방법 최종 보고.

## Spec Kit 정비 (2026-11-13)

- [x] T023 constitution 0.2.0 개정 (.specify/memory/constitution.md)
- [x] T024 spec 1단계 범위·승인 시나리오 추가 (specs/001-jarvis-hybrid/spec.md, checklists/requirements.md)
- [x] T025 plan·research·data-model·contracts·quickstart 작성 (specs/001-jarvis-hybrid/)

## Phase 1: Setup

- [x] T030 의존성 없는 package.json(type module, test/start 스크립트)과 .gitignore(data/) 작성 (package.json, .gitignore)

## Phase 2: Foundational

- [x] T031 SQLite 열기·WAL·busy_timeout·스키마 작성 (src/store/db.js)
- [x] T032 [P] 비밀 형태 판별 (src/security/secrets.js)
- [x] T033 [P] 공통 오류 타입 AppError(code) (src/errors.js)

## Phase 3: US2 Mission Control (P1) 🎯 MVP

독립 검사: 미션 생성→승인 전 실행 거부→승인→1회 실행→중복 거부→재시작 복원.

- [x] T040 [US2] 내용 버전(SHA-256, 정렬 JSON)과 미션 생성·조회·목록 (src/mission/missions.js)
- [x] T041 [US2] 승인(버전 일치 필수)·거절·취소, 종료 상태 보호 (src/mission/missions.js)
- [x] T042 [US2] 내용 변경 시 새 버전·approved_version NULL·pending 복귀 (src/mission/missions.js)
- [x] T043 [US2] 조건부 UPDATE 선점으로 1회 실행, 실패 기록, 자동 재실행 없음 (src/mission/missions.js, src/mission/executors.js)
- [x] T044 [US2] 시작 시 running → interrupted 복원 처리, 상태 전이 이벤트 기록 (src/mission/missions.js)
- [x] T045 [US2] 검사: 승인 전·거절·내용 변경·동시 10회·다중 프로세스·재시작·실패 (test/missions.test.js, test/multiprocess.test.js)

## Phase 4: US2 Quick Actions (P1)

- [x] T050 [US2] Quick Action 등록·목록·실행=pending 미션 생성 (src/quick/quickActions.js)
- [x] T051 [US2] 직접 실행 경로 없음 확인 검사 (test/quick.test.js)
- [x] T052 [US2] CLI mission/quick 명령 (src/cli.js)

## Phase 5: US3 기억 CRUD (P2)

- [x] T060 [US3] 기억 저장·조회·목록·검색·수정·삭제 (src/memory/memory.js)
- [x] T061 [US3] 빈 내용·비밀 형태 거부 (src/memory/memory.js)
- [x] T062 [US3] CLI memory 명령 (src/cli.js)
- [x] T063 [US3] 검사: CRUD·재시작 후 유지·삭제 후 재노출 없음·비밀 거부 (test/memory.test.js)

## Phase 6: US3 공급자 모의 계약 (P2)

- [x] T070 [P] [US3] ProviderError·계약 정의 (src/providers/contract.js)
- [x] T071 [US3] 모의 공급자와 네 공급자 자리 표시자(네트워크 없음), 자동 대체 없음 (src/providers/mock.js, src/providers/registry.js)
- [x] T072 [US3] 검사: 순서·끝 신호·취소 후 조각 0·오류 분류·대체 없음 (test/providers.test.js)

## Phase 7: Polish

- [x] T080 CLI 종단 검사 (test/cli.test.js)
- [x] T081 README·BLOCKERS 갱신, 실행 명령·결과 기록

## Phase 8: 공급자 HTTP 어댑터 (2단계 준비, 실제 API 아님)

- [x] T090 [US3] SSE·NDJSON 읽기, 상태 코드 분류, 키 지우기, 루프백 판별 (src/providers/http.js)
- [x] T091 [US3] openai·claude·grok·ollama 어댑터, 외부 주소 기본 차단(JARVIS_ALLOW_REMOTE), 키·모델 없으면 네트워크 없이 거부 (src/providers/adapters.js)
- [x] T092 [US3] ProviderRegistry.fromEnv 추가, 오류 코드 not_found·refused 추가 (src/providers/registry.js, contract.js)
- [x] T093 [US3] 가짜 로컬 서버 검사 13개 (test/adapters.test.js)
- [x] T094 [US3] OpenAI·xAI·Ollama 공식 문서와 형식 대조 (OpenAI API 참조 페이지는 403, cookbook으로 대신 확인)
- [x] T095 [US3] 사용자 승인 후 Ollama 로컬 실제 검사 (scripts/ollama-smoke.js, gemma4:12b, Windows)
- [x] T097 [US3] 생각(thinking) 처리 방침 — 2026-11-14 사용자 결정: "빠른 답(생각 생략)"을 기본으로 켬(사용자가 끄면 끈 값 유지). 근거: Windows 실측 첫 소리 8.1초 → 1.3초. 원본 확보 후 재검토, Mac 실측 필요
- [x] T221 "빠른 답(생각 생략)" 설정: Ollama think:false 전달, 기본 꺼짐·재시작 후 유지, /api/chat/settings, 화면 체크, 외부 전송 미션 내용에는 넣지 않음 (adapters.js, transfer.js, services.js, server.js, index.html)
- [x] T222 검사 3개 (test/fast-answer.test.js), 지연 측정 도구에 --think 옵션·답 기록 (scripts/latency-check.js)
- [x] T098 [US3] 클라우드 실제 검사 스크립트(기본은 계획만 표시, --yes-send 때만 전송, 키·모델 없으면 0회 전송)와 키 파일 예시 (scripts/cloud-smoke.js, .env.local.example, .gitignore)
- [ ] T096 [US3] 사용자가 .env.local에 키를 넣은 뒤 클라우드 공급자 실제 검사 (T014). 사용자 선택: API 키 방식

## Phase 9: 개인 자료 외부 전송 승인 (잠정, FR-010a, 원본 확인 전)

- [x] T100 [US3] spec FR-010a·예외 상황, data-model 전송 미션, contracts/cli.md chat 명령 추가
- [x] T101 [US3] 공급자 describe()로 외부 여부 판정(루프백 아님=외부), 등록부 describe (src/providers/adapters.js, mock.js, registry.js)
- [x] T102 [US3] Conversation.ask: 외부+기억이면 승인 대기 미션, 미션에는 기억 번호·해시만, 실행 때 해시 확인 후 전송 (src/conversation/transfer.js)
- [x] T103 [US3] CLI chat ask, mission show 미리 보기, .env.local 읽기(검사에서는 끔) (src/cli.js)
- [x] T104 [US3] 검사 11개 + CLI 1개 (test/transfer.test.js, test/cli.test.js)
- [ ] T105 원본 확보 후 전송 승인 정책(대상 자료 범위, 질문만 보내는 경우 포함 여부) 재검토

## Phase 10: 끼어들기 차례 관리 로직 (FR-002, 기기 없음)

- [x] T110 [US1] 상태(대기·듣기·생각·말하기), 끼어들기 시 생성 취소+재생 중지, 옛 차례 늦은 조각 폐기, 옛 재생 끝 신호 무시, 오류 시 대기·자동 대체 없음 (src/conversation/turns.js)
- [x] T111 [US1] 가짜 재생기 검사 9개 (test/turns.test.js)
- [ ] T112 [US1] Mac·Windows 각각 실제 발화 감지를 TurnManager에 연결하고 끼어들기 지연 실측 (T016, 마이크 승인 필요)

## Phase 11: 회의 기록 시간·삭제 규칙 (FR-008, 기기 없음)

- [x] T120 [US5] 회의·녹취 구간 표, 한 번에 하나만 녹음, 시간 규칙(0 이상·끝>시작·순서·길이), 멈출 때 자르기/지우기 (src/store/db.js, src/meeting/meetings.js)
- [x] T121 [US5] 구간 시간 → 원음 재생 위치, 원음 없음 알림, 원음만·녹취만·전체 삭제, 원음 삭제 실패 시 기록 유지, 저장 폴더 밖 경로 거부, 재시작 시 중단 처리
- [x] T122 [US5] 검사 10개 (test/meetings.test.js)
- [ ] T123 [US5] Mac·Windows 각각 실제 녹음·녹음 중 표시·재생 연결, 외부 전사는 전송 승인 경로(FR-010a) 연결 (T019, 녹음 승인 필요) — 2026-11-14 화면 녹음·표시·재생은 T233(가짜 마이크로 확인). 남은 것: 실제 마이크(T235), Mac(T137), 외부 받아쓰기(원본·전송 정책 확인 후)

## Phase 12: Windows·macOS 각각 단독 실행 + 로컬 화면 (FR-013, 사용자 결정 2026-11-13)

- [x] T130 plan·spec에 두 기기 각각 단독 실행 반영(동기화 없음)
- [x] T131 앱 조립과 시작 시 복원 (src/app/services.js)
- [x] T132 127.0.0.1 전용 서버, Host 검사, 실행별 토큰, 1MB 제한, 오류 코드→HTTP 상태 (src/server/server.js)
- [x] T133 브라우저 화면: 승인 대기·빠른 작업·대화·기억·회의 (src/server/public/index.html)
- [x] T134 실행 진입점과 두 OS 실행 파일 (src/main.js, start-jarvis.cmd, start-jarvis.command, package.json scripts)
- [x] T135 서버 검사 10개 (test/server.test.js)
- [x] T136 Windows에서 실제 실행·화면 조작 확인, 화면 결함 수정
- [ ] T137 macOS에서 npm test·npm start·화면 확인 (Mac 필요)
- [x] T138 OS별 음성 입출력 계층(Windows·macOS) 설계·연결 — 출력은 T140~T145, 입력은 T147·T215(브라우저 녹음 → whisper.cpp, 두 OS 같은 코드). macOS 실행 확인은 T137·T146·T213

## Phase 13: 음성 출력 계층 (FR-001 출력, Windows·macOS)

- [x] T140 [US1] 답 조각을 문장으로 모으기 (src/voice/sentences.js)
- [x] T141 [US1] 재생기: TurnManager player 계약(play·stop·finish), 끊으면 말하던 것 중지·남은 문장 버림, 다 말하면 끝 신호 (src/voice/player.js)
- [x] T142 [US1] OS 내장 합성기: Windows PowerShell System.Speech, macOS say(미검증). 글은 표준 입력으로 전달 (src/voice/system-speaker.js)
- [x] T143 [US1] 가짜 스피커 검사 9개 (test/voice.test.js)
- [x] T144 [US1] Windows 실제 합성 검사 스크립트, WAV 파일로만 (scripts/tts-smoke.js)
- [x] T145 [US1] 화면·대화와 음성 출력 연결: 소리 읽기 켜기·끄기(기본 꺼짐), 말 멈추기, 새 질문 시 옛 답 읽기 끊기 (src/app/services.js, src/conversation/transfer.js, src/conversation/turns.js cancel, src/server/server.js /api/voice, index.html, test/voice-server.test.js)
- [ ] T148 [US1] 실제 스피커 청취 확인 (사용자 청취 필요)
- [ ] T146 [US1] macOS say 실제 확인 (Mac 필요)
- [x] T147 [US1] 마이크 입력·발화 감지 — 녹음 승인 받음, 구현은 T215, 실제 마이크 확인은 T218

## Phase 14: 캐릭터 설정 (US4 기기 없는 부분, 잠정)

- [x] T150 [US4] 캐릭터·설정 표, 저장소(이름·말투·목소리·자산 출처/이용 조건 필수, 비밀 거부), 적용 유지 (src/store/db.js, src/store/settings.js, src/character/characters.js)
- [x] T151 [US4] 적용 캐릭터 말투를 대화 첫 시스템 메시지로, 외부 전송 미션에 승인 당시 캐릭터 저장 (src/conversation/transfer.js)
- [x] T152 [US4] 적용 캐릭터 목소리로 소리 읽기, 목소리 목록, 미리 듣기, 소리 읽기 설정 재시작 후 유지 (src/app/services.js)
- [x] T153 [US4] 화면 API와 캐릭터 탭, 대화 상태에 캐릭터 이름 (src/server/server.js, index.html, contracts/http.md)
- [x] T154 [US4] 검사 10개 (test/characters.test.js)
- [ ] T155 [US4] 캐릭터 그림·표정·입 모양, 상태(듣기·생각·말하기) 시각 표현 (원본 확인 후) — 2026-11-14 잠정안(도형 얼굴·상태·입 박자) T249~T251 완료. 원본 그림·표정과의 대조는 남음
- [ ] T156 [US4] 목소리 미리 듣기 실제 청취 (사용자)

## Phase 15: 문서 일관성 분석과 삭제 자료 정리 (2026-11-13)

- [x] T159 /speckit-analyze로 spec·plan·tasks·constitution 대조 (중대 1, 높음 1, 보통 5, 낮음 1)
- [x] T160 C1 수정: secure_delete 켜기, 기억 수정·삭제·캐릭터 삭제·회의 녹취 삭제 뒤 WAL 비우기 (src/store/db.js scrub, memory.js, characters.js, meetings.js)
- [x] T161 파일 바이트 직접 검사 4개 (test/secure-delete.test.js)
- [x] T162 I1~I6·U1 문서 수정 (spec.md, plan.md, quickstart.md, tasks.md)
- [x] T163 수정 전에 만든 기존 DB 파일의 빈 공간 정리(VACUUM) 방법 안내·도구: `npm run cli -- db compact` (src/store/db.js compactDb, cli.js, test/db-compact.test.js 3개). 실제 사용자 DB는 없어 정리해 본 적 없음

## Phase 16: 2026-11-14 경계 상황 QA와 결함 수정

- [x] T170 현재 파일 기준 npm test(122개 통과) 후 임시 폴더에서 경계 상황 탐색·재현
- [x] T171 D1 본문이 JSON 객체가 아니면 400 (src/server/server.js readJson)
- [x] T172 D2 작업 기록에 비밀 키 형태 거부, 생성·수정 모두 (src/mission/missions.js rejectSecrets)
- [x] T173 D3 캐릭터 수정 뒤 옛 원문 파일 정리 (src/character/characters.js scrub)
- [x] T174 D4 끊긴 대화 답 버림(글 비움·discarded), 화면 안내 (src/conversation/transfer.js, index.html)
- [x] T175 D5 1MB 초과 요청은 연결을 끊지 않고 413 (src/server/server.js)
- [x] T176 D6 회의 시간·ID는 안전한 정수만 (src/meeting/meetings.js, src/server/server.js toId)
- [x] T177 D7 전송 미션에 승인 대상(주소·외부 여부·모델) 저장, 실행 직전·어댑터에서 재확인, 재시작·설정 변경 포함 (src/conversation/transfer.js checkTarget, src/providers/registry.js, adapters.js) — 사용자 보고 결함
- [x] T178 D8 공급자 요청의 리디렉션 차단 (src/providers/http.js redirect: manual, redirect_blocked) — 사용자 보고 결함
- [x] T179 재현 검사 17개 (test/regressions-1114.test.js 8개, test/transfer-binding.test.js 9개)

## Phase 17: 소리 읽기 끈 글 대화 멈추기 (FR-002, 2026-11-14)

- [x] T180 글 대화도 취소 신호로 생성을 끊고 끊긴 답은 버림, 동시 진행 대화 모두 멈춤 (src/conversation/transfer.js stopAll)
- [x] T181 멈추기 API가 소리 차례와 글 대화를 함께 끊음, 버튼 이름 "답 멈추기" (src/server/server.js, index.html)
- [x] T182 검사 4개 (test/text-stop.test.js)
- [x] T183 로컬 Ollama 실제 확인(gemma4:12b, 도중 멈추기)

## Phase 18: 화면 수정 빈틈 채우기 (2026-11-14)

- [x] T190 기억 카드에 태그 입력, 내용·태그 함께 수정 저장 (src/server/public/index.html)
- [x] T191 캐릭터 카드 "캐릭터 수정": 이름·말투·목소리·자산 줄 추가/빼기, 저장·취소. 서버 검사 그대로 적용 (index.html editCharacter)
- [x] T192 화면 요청 형태 검사 2개 (test/edit-api.test.js)
- [x] T193 Windows 내장 브라우저로 실제 조작 확인

## Phase 19: Mac 전용 검증 항목을 Mac·Windows 각각으로 (2026-11-14, 사용자 요청)

- [x] T200 헌법 0.3.0(원칙 II·IV: 지연·실기는 Mac·Windows 각각), spec US1·SC-005, plan 성능 목표·단계, tasks T015·T021·T097·T112·T123 문구 정비
- [x] T201 Windows 음성 인식기 설치 여부 확인(마이크 미사용): System.Speech 인식기 0개, Windows 받아쓰기 언어 목록 비어 있음
- [x] T202 두 OS 공통 지연 측정 스크립트(로컬 Ollama → 차례 관리 → 문장 → OS 합성, WAV만·소리 없음) (scripts/latency-check.js)
- [x] T203 Windows 기준 실측(아래 기록)
- [ ] T204 Mac에서 같은 스크립트로 실측(Mac 필요)
- [x] T207 음성 입력 엔진 후보 검토(공식 자료, 설치 없음): 추천 whisper.cpp+whisper-server, 마이크는 ffmpeg, 발화 감지는 소리 크기→Silero VAD. research.md 기록
- [x] T205 Windows·macOS 음성 입력 엔진 선택(이 PC는 내장 한국어 인식기 없음 → 로컬 Whisper 등 검토) — 2026-11-14 whisper.cpp로 결정, 다운로드(T209)·녹음 승인(T215) 받음. macOS 설치 확인은 T213
- [ ] T206 두 기기 실측 뒤 성능 목표 수치 확정(SC-005)

- [x] T208 whisper.cpp 다운로드 대상 확인(이름·크기·sha256, 다운로드 안 함). research.md 기록
- [x] T209 Windows 실행 파일·모델·VAD 다운로드(사용자 허용), sha256 3개 일치, 경로 검사 후 tools/whisper/v1.9.2 해제, whisper-cli·whisper-server 실행 확인(시험 음성 파일)
- [x] T210 한글 프롬프트 글자 깨짐 원인 확정 → 영문 프롬프트 사용, VAD 켬으로 무음 지어내기 방지
- [x] T211 두 OS 공통 받아쓰기 확인 스크립트 (scripts/stt-smoke.js)
- [x] T212 JARVIS에 받아쓰기 연결(마이크 제외): whisper-server를 JARVIS가 127.0.0.1 임의 포트에 처음 쓸 때 띄우고 종료 때 끔, ffmpeg로 형식 변환, 음성은 메모리로만, /api/stt(최대 25MB·120초), 화면 "음성 파일로 질문 넣기" (src/voice/wav.js, src/voice/stt.js, services.js, server.js, main.js, index.html)
- [x] T214 받아쓰기 검사 13개 (test/stt.test.js)
- [x] T215 마이크 입력(사용자 녹음 승인 2026-11-14): 브라우저 녹음(Windows·macOS 공통) → /api/stt. "말하기" 버튼(말이 끝나 조용해지면 자동 멈춤, 8초 무음이면 멈춤), "받아 적으면 바로 보내기", 듣기 모드(말소리 감지로 자동 녹음), 녹음 시작 시 읽던 답 멈춤(끼어들기), 녹음 중 표시, 끝나면 마이크 놓음, 권한 거부·장치 없음·사용 중·연결 끊김 안내 (src/server/public/voice-input.js, index.html, server.js)
- [x] T217 발화 감지·정적 스크립트·마이크 권한 정책 검사 8개 (test/voice-input.test.js)
- [ ] T218 실제 마이크로 말하기·듣기 모드·끼어들기 확인 (이 Windows PC에는 마이크 없음 → 마이크 연결 뒤 또는 Mac에서)
- [x] T219 듣기 모드에서 스피커로 읽는 답에 스스로 반응하는 문제(에코) 대책: 말하는 중 들린 소리는 1.5초를 받아 적어 방금 읽은 글과 비교, 같으면 무시·다르면 끼어들기 (src/voice/echo.js, player.js, services.js, server.js `?echo=check`, index.html). 화면 확인은 가짜 마이크(합성 음성)·가짜 스피커로만 함
- [ ] T231 실제 스피커·마이크로 에코 대책 확인(스피커 소리가 마이크로 들어올 때 받아쓰기 일치율, 끼어들기 지연) — 마이크 필요
- [x] T232 녹음 시작 앞부분이 빠지는 문제("자비스,"가 빠짐, 약 0.4초) 대책: 마이크 소리를 늘 0.8초 미리 담고 듣기 모드 녹음 시작 때 앞에 넣음, 녹음은 화면에서 16kHz WAV로 바로 만듦 (voice-input.js `createPcmCapture`, index.html). 화면 확인은 가짜 마이크로만 함(실제 마이크는 T218)
- [x] T216 이름("자비스") 인식 개선: 실측한 오인식(차비스·Javis·CHAVIS 등)만 받아 적은 뒤 "자비스"로 바로잡기(원래 글도 함께 제공, 끌 수 있음). 프롬프트는 영문만 허용·바꿔 끼울 수 있게 (src/voice/stt.js, scripts/name-check.js, test/stt.test.js 3개)
- [ ] T220 사람 목소리로 이름 인식 확인(지금 측정은 OS 합성 음성 Heami 기준, 마이크 필요)
- [ ] T213 Mac에서 brew whisper.cpp + 같은 모델로 stt-smoke 실행(Mac 필요)

- [x] T223 빠른 답 품질 비교 도구와 Windows 실측 (scripts/quality-check.js [--hard])
- [x] T224 자동 전환(사용자 결정 2026-11-14): 빠른 답이어도 계산·추론으로 보이는 질문은 생각함으로 보냄. 기본 켬, 끌 수 있음, 재시작 후 유지, 화면에 이유 표시 (src/conversation/reasoning.js, transfer.js, services.js, server.js, index.html)
- [x] T225 검사: 판단 규칙 3개(test/reasoning.test.js), 자동 전환·설정 2개(test/fast-answer.test.js), 세 방식 비교 도구 (scripts/quality-check.js --set)
- [x] T226 놓친 계산 질문 유형 보완: 말로 쓴 수(삼천오백 원·열두 개·마흔다섯), 활용한 계산 동사, 거스름돈·약수·경우의 수·거짓말 퍼즐·순위·단위 바꾸기. 따로 만든 새 문제로 평가(holdout 계산 27→40/50, 일상 오판 0/51) (src/conversation/reasoning.js, test/reasoning.test.js, test/fixtures/reasoning-*.json)
- [x] T236 holdout에서 놓친 10개 유형 보완("…어떻게 돼?", 쉼표 수열, "N일 뒤 무슨 요일", "고르는 방법", 순서 퍼즐, 센티·밀리리터). 세 번째 새 문제 묶음으로 평가: 계산 44→55/60, 일상 오판 0/61 (src/conversation/reasoning.js, test/reasoning.test.js, test/fixtures)
- [x] T237 세 번째 묶음에서 놓친 5개 유형(수 낱말만 쓴 최소공배수, "…말이 맞아?" 순서 판단, 분수로 바꾸기, 톤 단위, 연속한 수의 합) — 2026-11-14 보완, 넷째 새 묶음 계산 27→44/60, 일상 오판 1/60(T241)
- [x] T253 넷째 묶음에서 놓친 16개(세는 말 없는 한자어 수·단위 이름·"몇 분의 몇"·맞는지 따지기)와 "프로" 오판 1개 보완. 다섯째 새 묶음: 계산 43→56/60, 일상 오판 1/60(다른 문장) (src/conversation/reasoning.js, test/reasoning.test.js, test/fixtures)
- [x] T254 다섯째 묶음에서 놓친 4개·오판 1개 유형 보완(나누어떨어짐, 요일·기간 범위 반복, 한글 기간 합산·바꾸기, 제품 이름 "프로"와 퍼센트 구분). 여섯째 새 묶음: 계산 47→57/60, 일상 오판 2→0/60 (src/conversation/reasoning.js, test/reasoning.test.js, test/fixtures)
- [x] T256 T254 보강(독립 검증 변형): "…요일에서 …까지 매일"(씩 없음)·"두 주랑 사흘을 합치면"·"면" 앞 기간. 변형 8개·함정 6개 검사 추가
- [x] T255 여섯째 묶음에서 놓친 3개 고침("보름 하고 닷새면" 기간 조사, "삼 주는 몇 시간" 단일 기간 바꾸기, 섭씨↔화씨). 여섯째 묶음을 회귀 검사 dev6으로 바꿈(허용값 없이 전부 맞혀야 함)
- [x] T227 [US5] 회의 음성 파일 가져오기: 원음 저장(16kHz WAV)·시간 구간 회의록·실패 시 반쪽 기록 정리, POST /api/meetings/import, GET /api/meetings/:id/audio, 화면 회의 탭 가져오기·시간 눌러 재생 (meetings.js, stt.js, server.js, index.html)
- [x] T228 회의 파일은 VAD 없는 받아쓰기 엔진을 따로 쓰고, 소리 없는 구간(지어낸 말)은 뺌 (main.js, services.js, stt.js dropSilentSegments)
- [x] T229 검사 6개(test/meeting-import.test.js), 실제 whisper로 회의 파일 2개 확인, 화면 재생 위치 확인(소리 끔)
- [ ] T230 사람이 말한 실제 회의 녹음(잡음·여러 화자·긴 파일)으로 시간 구간·지어낸 말 빼기 확인. 무음 기준(RMS 300)은 합성 음성으로만 정함
- [x] T233 [US5] 회의 마이크 녹음(T123의 Windows 화면 부분): 화면이 조용한 틈에서 15~30초 조각(16kHz WAV)으로 보내면 원음 뒤에 바로 붙이고 이 기기 안에서 받아 적어 녹음 중에도 회의록 표시, 녹음 중 표시·시간, 멈추면 원음 머리글 맞춤, 꺼진 녹음 복구(재생 가능)·"끊긴 녹음 마무리", 조각 앞 무음 건너뛰어 시작 시간 맞춤 (src/meeting/live.js, meetings.js discard, services.js, server.js, index.html). 외부 받아쓰기 없음
- [x] T234 검사 6개(test/meeting-live.test.js), 실제 whisper + 가짜 마이크로 화면 확인(6문장, 조각 3개)
- [ ] T235 실제 마이크로 회의 녹음 확인(잡음·여러 화자·긴 회의, 조각 경계에서 말이 잘리는지) — 마이크 필요. Mac 확인은 T137

## Phase 20: 2026-11-14 Windows 남은 기능 묶음 (사용자 지시)

- [x] T240 명세·계획·작업 정비: FR-003a, FR-007a, FR-008a~c (spec.md, plan.md, tasks.md)
- [x] T241 T237 계산 판단 보완(학습 묶음과 새 평가 묶음 분리, 모델 대량 호출 없음) (src/conversation/reasoning.js, test/reasoning.test.js)
- [x] T242 [US5] 회의록 검색: MeetingStore.search, GET /api/meetings/search, 회의 탭 검색·시간 눌러 재생 (meetings.js, server.js, index.html)
- [x] T243 [US5] 회의록 검색 검사: 제목·녹취·시간 구간, 특수문자, 삭제 뒤 결과 (test/meeting-search.test.js)
- [x] T244 [US2] 실제 로컬 Quick Action 기억 검색·회의록 검색: 미리 보기, 승인 전 결과 없음, 결과는 번호만, 화면에서 현재 자료로 풀어 보임 (quickActions.js, executors.js, services.js, cli.js, index.html)
- [x] T245 [US2] 검색 Quick Action 검사: 승인·거절·취소·중복·잘못된 입력·API 경로·자료 잔류 (test/quick-search.test.js)
- [x] T246 [US5] 회의 조각 순서 번호와 중복 방지(응답 유실 재전송, 다른 내용 같은 번호, 건너뛴 번호, 번호 없는 옛 호출) (live.js, server.js, index.html)
- [x] T247 [US5] 조각 재전송 재현 검사(첫 응답만 끊고 같은 요청 재전송) → 수정 → 재검사 (test/meeting-live.test.js)
- [x] T248 [US5] 회의 삭제 뒤 화면 재생 멈춤·원음 사본(blob URL)·캐시 정리, 바뀐 원음은 다시 받기 (index.html)
- [x] T249 [US4] 캐릭터 얼굴(도형·색·눈) 저장·검증·재시작 복원, 옛 DB 열 추가 (characters.js, db.js)
- [x] T250 [US4] 얼굴 그리기·상태(대기·듣기·생각·말하기)·입 박자 모듈과 화면 연결, 미리 보기·취소·적용 (public/avatar.js, server.js, index.html)
- [x] T251 [US4] 캐릭터 얼굴 검사: 상태 판단·그리기·입 박자·움직임 줄이기·저장·복원 (test/avatar.test.js, test/characters.test.js)
- [x] T252 실제 화면 확인(가짜 마이크·소리 없음)과 전체 검사

## Phase 21: 2026-11-14 Windows 실제 실행 QA (실제 src/main.js, 시험 데이터, 사용자 지시)

- [x] T257 실제 main.js를 시험 데이터 폴더·임의 포트로 실행(JARVIS_NO_ENV_FILE=1, JARVIS_ALLOW_REMOTE=0, Ollama 127.0.0.1:11434 gemma4:12b)하고 대화·기억·외부 전송 승인/거절·실패 안내·멈추기/다시 묻기 확인
- [x] T258 화면 연결이 끊기면(새로 고침·닫기·응답 유실) 그 요청의 답 생성을 끊음 — 글 대화와 소리 읽기 켠 대화 모두, 옛 요청이 새 차례를 끊지 않게 차례별 연결 (server.js, transfer.js, turns.js, test/text-stop.test.js, test/turns.test.js)
- [x] T259 끄기 순서 고침: 진행 중인 답 생성·소리 읽기·미리 듣기·실행 중 전송 미션·받아쓰기를 먼저 끊고 → 화면 서버를 3초 안에 닫고 → DB를 닫음. SIGHUP(콘솔 창 닫기)·SIGBREAK(Ctrl+Break)도 같은 길 (src/app/shutdown.js, services.js, missions.js, main.js, test/shutdown.test.js)
- [x] T260 실제 Windows CLI 자식 프로세스로 끄기 회귀 확인(Ollama 답 생성 중 + whisper-server 자식)
- [x] T261 느린 응답 사이 탭 빠른 전환 때 공급자 선택지 중복(5→10개)과 옛 응답이 새 선택·설정을 덮는 문제 고침 (index.html loadChat·loadCharacters, test/chat-tab-race.test.js)
- [x] T262 캐릭터 얼굴 만들기·상태 미리 보기·저장·수정 취소/저장·적용·대화 상태 일치·재시작 복원 실제 화면 확인
- [x] T263 실제 whisper 회의 파일 가져오기·검색·시간 위치(무음 재생)·빠른 작업 검색 승인/거절/실행·삭제 뒤 검색/캐시/파일 정리 실제 화면 확인
- [x] T264 실제 whisper가 마침표만 따로 낸 구간을 앞 구간에 붙임 (stt.js, test/meeting-import.test.js)
- [x] T265 실행 경로·포트 충돌·공백/한글 데이터 경로·잘못된 Host·잘못된 검색어 확인, 전체 검사
- [x] T266 반복 QA(흐름마다 10회 이상): 답 멈추기/다시 묻기, 캐릭터 A↔B 전환(생성 중·직후·탭 이동), 회의록 검색 빠른 전환·탭 전환·캐릭터 변경 겹침 — 실제 서버와 응답 순서 뒤집기 프록시 둘 다
- [x] T267 회의록 검색어를 빠르게 바꾸면 늦게 온 옛 결과가 새 결과를 덮던 결함 고침(최신 검색만 반영) (index.html searchMeetings, test/meeting-search-race.test.js)
- [x] T268 검색 경합 보강: 늦게 실패한 옛 검색은 알림 없이 무시, 지금 검색이 실패하면 옛 결과를 지우고 "찾지 못함" 표시, 삭제 뒤 다시 찾기와의 경합 검사 (index.html, test/meeting-search-race.test.js)
- [x] T269 데이터 폴더 잠금: 같은 데이터 폴더로 두 번째 JARVIS를 켜면 DB를 열거나 시작 복원하기 전에 끝냄(같은 포트·다른 포트 모두). 정상 종료 때 풀고, 꺼진 프로세스가 남긴 잠금은 넘겨받음 (src/app/data-lock.js, services.js, main.js, test/data-lock.test.js) — 처음 PID 파일 방식은 T271에서 OS 잠금으로 바꿈
- [x] T270 첫 검색 응답을 기다리는 중(결과 0개)에 회의를 지우면 다시 찾지 않아 늦게 온 옛 결과가 지운 회의를 보이던 구멍 고침: 검색을 한 번이라도 했고 검색어가 있으면 다시 찾음 (index.html refreshMeetingSearch, test/meeting-search-race.test.js)
- [x] T271 데이터 폴더 잠금을 OS 파일 잠금으로 바꿈: 따로 둔 SQLite 파일(jarvis.lock.db)의 BEGIN EXCLUSIVE를 프로세스가 사는 동안 쥠. PID 파일의 빈 파일 틈·남은 PID 경합 결함 해소, 강제 종료 때 OS가 풂 (src/app/data-lock.js, test/data-lock.test.js)
- [x] T272 동시에 켠 실행이 모두 "쓰는 중"으로 끝나 아무도 시작 못 하던 결함 고침: 잠금 기다림 0 → 2초(busy_timeout 2000) (src/app/data-lock.js, test/data-lock.test.js 4프로세스 동시 검사)

## Phase 22: 2026-11-14 자비스 모드·다른 기기 접속 (사용자 요청)

- [x] T273 외부 접속 옵션 `--host <주소>`: 기본은 127.0.0.1 전용, 주면 그 주소로도 열고 Host 허용 목록에 더함. 같은 와이파이에서 주소를 아는 누구나 쓸 수 있다는 안내 (main.js, server.js, test/server.test.js)
- [x] T274 자비스 모드 화면 `/jarvis`: 캐릭터 얼굴·상태·말풍선 대화·글 입력·말하기(보안 연결에서만)·멈추기. 이 기기 안 공급자만 사용, 기억 미포함. 설정 모드(`/`)와 서로 이동 (public/jarvis.html, server.js, index.html)
- [x] T275 장치 점검(자비스 모드 안): 연결 방식·서버·화면·터치·네트워크·장치 목록·마이크·카메라·스피커·움직임 센서·전원·진동. 마이크·카메라·스피커는 사용자가 눌러야만 시험, 저장·전송 없음 (public/jarvis.html)
- [x] T276 와이파이 접속에서 말하기·마이크·카메라를 쓰기 위한 보안 연결(HTTPS) 옵션 `--https`: 데이터 폴더 tls/에 이 PC 전용 자체 서명 인증서(127.0.0.1·localhost·--host 주소)를 openssl로 한 번 만들어 씀. 시작 때 인증서 지문 출력 (src/app/tls.js, server.js, main.js, test/tls.test.js)
- [ ] T278 휴대폰·토스 기기에서 `https://<주소>/jarvis`로 열어(인증서 경고 확인 뒤) 말하기·마이크·카메라 실제 확인 — 사람이 해야 함
- [x] T277 토스 기기에서 브라우저 대신 앱처럼 쓰기 — 2026-11-15 PLF01WH에 LineageOS 18.1(arm64, Android 11)을 올린 뒤 JARVIS 앱 0.2.1 설치·실행 확인(Phase 24)

## Phase 23: 2026-11-14 치이카와 대화 모드·디자인 고도화 (사용자 요청)

- [x] T279 캐릭터 그림 얼굴: 상태별(대기·듣는 중·생각 중·말하는 중 1·2) 그림을 올려 저장. 파일 앞부분으로 PNG·JPEG·GIF·WebP만 받음(SVG 거부), 한 장 5MB, 데이터 폴더 avatars/에만 저장, 토큰 있어야 받기, 화면은 blob으로만 보임. 캐릭터를 지우면 그림도 지움 (src/character/avatar-images.js, server.js, services.js, index.html, test/avatar-images.test.js)
- [x] T280 대화 모드(자비스 모드): 그림 얼굴이 상태에 따라 바뀌고 말할 때 1·2를 번갈아 보임, 답을 연 기기의 브라우저 음성(ko-KR)으로 읽기(켜고 끄기, 첫 누름에 소리 허락), 입력 중 점·한 글자씩 보이기 (public/jarvis.html)
- [x] T281 자비스 모드 디자인 고도화(따뜻한 카드형): 오늘 나눈 대화 수(이 기기에만 기록), 큰 캐릭터 무대와 머리 위 말풍선, 상태 글, 요약 타일 2개(승인 대기·저장된 회의 → 설정의 그 탭), 네모 아이콘 단추와 툴팁, 보이는 입력 이름표, 막지 않는 보내기 단추, 오류 내용 복사 (public/jarvis.html)
- [x] T282 설정 모드 쓰기 쉽게: 같은 따뜻한 색, 탭마다 한 줄 안내, 대화 탭 고급 설정 접기, 지우기 확인 창(이름을 보이고 "취소"에 초점, 기억·회의·캐릭터), 비어 있을 때 안내와 할 일 단추, 주소(#meetings 등)로 탭 열기, 44px 누르기 크기 (public/index.html)
- [x] T284 참고 화면(캐릭터 앱 시안 7장, 2026-11-14 사용자 제공) 반영 v3: 휴대폰에서 화면 위를 채우는 캐릭터 무대(적용한 캐릭터 얼굴 색을 옅게 섞은 배경, 넓은 화면은 둥근 카드), 시간별 인사말과 큰 캐릭터 이름, "함께할 친구" 카드 줄(누르면 그 캐릭터 적용, 지금 대화 중 표시), 둥근 알약 입력 막대(말하기·입력·멈추기·보내기, 보이는 이름표 유지), 설정 모드 캐릭터 카드에 색 띠와 큰 얼굴 (public/jarvis.html, index.html). 유리 효과는 쓰지 않음
- [x] T285 치이카와·산리오 캐릭터 고르기: 치이카와 4(치이카와·하치와레·우사기·모몬가)·산리오 8(헬로키티·마이멜로디·쿠로미·시나모롤·폼폼푸린·포차코·케로케로케로피·한교동). 이름·새로 쓴 짧은 말투 설명·도형 얼굴 색만 있고 그림·대사는 없음. 같은 이름이 있으면 새로 만들지 않고 다시 적용(고친 말투 유지). 자비스 모드 "친구 고르기" 창, 설정 → 캐릭터 "목록에서 고르기" (src/character/presets.js, server.js `/api/character-presets`, jarvis.html, index.html, test/character-presets.test.js)
- [x] T286 화면 그림 6장(휴대폰 첫 화면·전체, 친구 고르기 2장, 설정 캐릭터, PC 1280)을 Edge 헤드리스(임시 프로필)로 찍어 docs/screenshots/에 저장 (시험 데이터, 소리 없음)
- [x] T287 쉬는 화면·깨우기(카메라 열·자원 줄이기): 손 안 댄 지 1분 idle, 3분이면 어두운 쉬는 화면(시계 30초마다만 바꿈, 캐릭터 움직임·얼굴 그리기·상태 묻기·요약 새로 고침 멈춤, 뒤 화면 inert). 깨우기는 가벼운 것부터: 근접 센서(브라우저가 줄 때만) → 화면 누르기 → "카메라로 깨우기"(켰을 때만, 쉬는 동안 idle 15초·asleep 30초마다 160×120으로 약 1초 켜서 32×24 회색 두 장과 지난 장면을 비교하고 바로 끔, 그림 저장·전송 없음). 카메라 실패·거부면 자동으로 끔. 장치 점검에 근접 센서 항목 (src/server/public/presence.js, jarvis.html, server.js, test/presence.test.js)
- [x] T288 누구인지 알아보기(2026-11-14 사용자 승인: 모델 내려받기, 얼굴 정보는 그 기기에만): face-api 1.7.15(MIT, 2025-02 보관 처리됨) 파일 7개 약 8.1MB를 jsdelivr에서 받아 sha256 해시를 jsdelivr 공개 값과 맞춘 뒤 src/server/public/vendor/face-api-1.7.15/에 둠(eval·외부 호출 없음 확인). 자비스 모드 "알아볼 사람" 카드: 이름(칸 떠날 때 검사)·본인 동의 체크 후 얼굴 5장 찍기 → 얼굴 특징 숫자만 그 기기 브라우저(localStorage)에 저장, 사진 저장 없음, 사람별 지우기(확인 창). 카메라로 깨어나거나 근접 센서로 깨어나면(카메라로 깨우기 켬) 같은 카메라로 누구인지 보고 "OO님, 어서 와요!". 모델은 처음 쓸 때만 받고 기기에 일주일 저장 (faces.js, jarvis.html, server.js, test/faces.test.js)
- [ ] T290 얼굴 알아보기 실제 확인 — 실제 얼굴·카메라로 등록·알아보기 정확도, 토스 기기에서 모델 준비 시간·열 확인(사람이 해야 함)
- [x] T289 토스 기기 근접 센서 직접 쓰기 → JARVIS 앱이 기기 근접 센서를 읽어 화면에 알림(T291)
- [x] T291 JARVIS 안드로이드 앱(2026-11-14 사용자 결정: 앱으로 만들고 토스 기기는 LineageOS로). Gradle 없이 SDK 도구로 만드는 android/build.mjs(사용자 승인: 다른 프로젝트 폴더의 SDK를 읽기만 함). WebView로 정한 https 서버의 /jarvis만 열고, 자체 서명 인증서는 PC가 보여 준 SHA-256 지문과 같을 때만 믿음, 다른 사이트 이동 막음, 카메라·마이크는 그 서버 화면이 요청할 때만 안드로이드 권한 확인 뒤 허용. window.JarvisApp: 근접 센서 알림·기기 음성(TTS, 한국어, 높이 1.3)·쉬는 화면 밝기 낮추기·연결 설정 다시 열기. 화면(jarvis.html)은 앱이 있으면 이것을 쓰고 장치 점검에 "JARVIS 앱" 항목 (android/AndroidManifest.xml, android/src/.../MainActivity.java, android/build.mjs, jarvis.html)
- [ ] T292 JARVIS 앱 실제 기기 확인 — 휴대폰 또는 LineageOS를 올린 토스 기기에 설치해 연결 설정·인증서 지문·카메라/마이크 권한·근접 센서·기기 음성·밝기 확인(사람이 해야 함)
- [x] T293 토스 프론트(근접 센서 없음) 카메라 사람 감지 보강(2026-11-15 사용자 요청, 로직만·기기 없음): (1) 깨우기에 tiny_face_detector(작은 검출기만 처음 한 번 로드, 입력 128)로 "얼굴 있음" 확인을 더해 조명·반사 오탐을 줄임. 얼굴을 봤으면 그 판정을 믿고, 모델을 못 받으면 지금의 움직임 비교로 되돌아감. (2) 깨어 있을 때도 25초마다 짧게 보고, 얼굴 없음이 연속 2번 이상이며 마지막 사람 확인 뒤 75초 지나면 쉬는 화면으로. 누름·말하기·듣기·답 읽기·등록·고르기 중이면(busy) 카메라를 켜지 않고 쉬는 화면으로도 안 감. 움직임 0만으로는(얼굴 미확인) 재우지 않아 가만히 있는 사람을 보호. (3) 근접 센서 없는 앱(hasProximity()===false)에서 카메라 깨우기를 처음 한 번 기본으로 켬. 사용자가 끈 'off'는 존중, 앱 아닌 브라우저는 기본값 그대로. (4) 판단은 presence.js 순수 상태 머신(awakeGlanceMs·absentMs·absentStreak, glance에 faceSeen 인자), jarvis.html은 카메라 연결만. (5) 진단 로그 console.info('[presence] ...') 한 줄(사람 유무·점수·상태 전환), 그림 데이터 없음. 검사: test/presence.test.js 7개 통과(얼굴 깨움·반사 오탐·떠남·활동 리셋·모델 없을 때 보호 추가) (src/server/public/presence.js, jarvis.html, test/presence.test.js). 미검증: 실기(토스 카메라 2개·열·전력·모델 준비 시간), 얼굴 미확인 시 폴백 정확도 — T290·T292에서 사람이 확인

## Phase 24: 2026-11-14 다른 자비스에서 가져온 아이디어 (사용자 요청 "순서대로", docs/reference-ideas.md)

출처: isair/jarvis(비상업 라이선스 → 코드 복사 없이 방식만 참고), open-jarvis/OpenJarvis(Apache-2.0, 방식 참고·새로 짬). 사용자는 상업용으로 쓰지 않음(2026-11-14).

- [x] T293 부르면 대답하기(주변 대화 듣기): 동의해야 켬(기본 꺼짐), 받아 적은 말은 PC 메모리에만 2분, 끄면 바로 지움. 문장 어디든 이름(자비스·적용 캐릭터, 자모 비슷함 0.78)이나 답 직후 3초(핫 윈도)일 때만 이 기기 안 Ollama로 "나한테 한 말인지" JSON 판정, 판정 모델이 없으면 규칙. 답할 때 방금 대화를 참고 자료로 이 기기 안 공급자에만 넣음(외부 공급자에는 절대 안 넣음) (src/voice/ambient.js, ambient-service.js, server.js /api/ambient*, jarvis.html 귀 단추)
- [x] T294 에코·멈춤 강화: 기기가 읽던 글과 시간을 맞춰 비교, 앞부분 에코 뒤의 사람 말은 살림, "그만·멈춰"는 AI 없이 바로 멈춤(긴 에코 속 "그만"은 무시), 말하는 중에는 3초까지만 담음, 일시 정지·끄기 뒤 옛 결과 버림 (src/voice/echo.js checkEchoTimed, jarvis.html)
- [x] T295 받아 적기 헛소리 거르기: whisper 구간의 no_speech_prob 0.5 이상·avg_logprob -0.7 미만·흔한 지어낸 문장("시청해 주셔서 감사합니다" 등)·프롬프트 조각(RVIS) 버림. /api/stt와 부르면 대답하기에 적용(회의 받아쓰기는 그대로) (src/voice/transcript-filter.js, stt.js filter)
- [x] T296 아침 브리핑: 매일 정한 시각(기본 06:00, 켬)에 PC가 이 기기 안 자료(날짜·승인 대기·어제오늘 회의)로 이 기기 안 Ollama가 한 번 쓰고 날짜별 저장. 자비스 모드 "오늘 브리핑" 카드(듣기=기기 음성, 지금 만들기, 매일 만들기·시각), 아침에 깨어나면 안 들은 브리핑 알림. 외부 주소 모델에는 안 보냄. 일정·메일·날씨는 외부 연결·인증이 필요해 아직 없음 (src/briefing/briefing.js, db briefings 표, /api/briefing*)
- [x] T297 승인 위험 단계: PC 규칙 표로 낮음(이 기기 안 읽기만)·높음(외부 전송·모르는 작업). 낮음은 화면에 보인 내용 버전 그대로 한꺼번에 승인, 높음은 하나씩. 24시간 넘게 기다린 대기는 취소로 정리(시작 때+1시간마다). 헌법(승인은 정확한 내용 버전에 묶음)에 맞게 "항상 허락" 기억 규칙은 넣지 않음 (src/mission/tiers.js, missions.js approveLow·expireStale, /api/missions/approve-low, index.html)
- [x] T298 기억 제안: 대화가 5분 멈추면 이 기기 안 모델이 사용자에 대한 오래 갈 사실만 뽑아 "기억할까요?"로 보여 줌(PC 메모리에만, 바로 저장 안 함). 고르거나 고쳐서 저장·버리기 (src/memory/suggest.js, /api/memory-suggestions*, index.html 기억 탭)
- [x] T299 비밀 값 가리기: 이메일·주소 비밀번호·각종 API 키·토큰·인증 머리글·JWT·"비밀번호: 값"·카드 번호·인증 번호·긴 16진수. 외부 공급자로 보내는 질문, 기억 제안 입력, 부르면 대답하기에 쌓는 말에 적용("암호 화폐" 같은 보통 말은 그대로) (src/security/redact.js)
- [x] T300 PC 점검: `node src/main.js --doctor`와 GET /api/health — Node·데이터 폴더·Ollama 켜짐/모델 있음(없으면 받는 명령 안내만, 내려받지 않음)·whisper 실행 파일/모델/VAD·ffmpeg·외부 전송. 자비스 장치 점검에 "PC 점검" 줄 (src/app/doctor.js)
- [x] T301 모델 받기 튼튼하게 → 이 앱은 모델을 스스로 내려받지 않아 해당 없음. 대신 T300이 빠진 모델과 받는 명령을 알려 줌
- [x] T302 보조 모델·저전력: JARVIS_OLLAMA_FAST_MODEL(있으면)로 판정·사실 뽑기를 작은 모델로, 저전력 모드(설정 → 대화 → 더 많은 설정, 기본 끔)면 판정·브리핑·기억 제안 모델을 1분만 메모리에 두고 미리 올리지 않음(보통 30분, 켤 때 미리 올림) (services.js modelPolicy, ollama 어댑터 format·options·keep_alive)
- [ ] T303 부르면 대답하기 실제 기기 확인 — 토스 기기·휴대폰 실제 마이크로 먼 거리 부르기·스피커 에코·"그만" 확인(사람이 해야 함)

## Phase 25: 2026-11-14 k-skill 연결 (사용자 요청·결정: 스킬마다 한 번 허락, 분야 전부)

- [x] T304 k-skill(NomaDamas/k-skill, MIT, 9766d20)의 "조회 서버(k-skill-proxy) 경유 조회 전용" 스킬 29개 설명서(skill.json·instruction.md)만 vendor/k-skill에 넣음(코드·패키지 없음, LICENSE·SOURCE.md 포함)
- [x] T305 스킬 연결: 켠 스킬만(기본 모두 꺼짐, 켤 때 동의 필요). 질문에 그 분야 낱말이 있을 때만 이 PC 안 모델이 스킬 고르기·설명서 읽고 조회 경로(그 설명서의 /v1/ 경로만) 정하기 → 정한 조회 서버 하나에 GET 한 번(리다이렉트 안 따름·8초·256KB 제한) → 결과를 참고 자료로 캐릭터가 대답. 기억·대화 기록·방 안 대화는 보내지 않고 비밀 값은 가림. 필요한 값이 없으면 되묻기, 실패하면 "확인 못 함" (src/skills/kskill.js, transfer.js)
- [x] T306 설정 → 스킬 탭: 분야별 목록, 켜기 동의 창(무엇이 어느 서버로 가는지), 기본 위치(위도·경도, 칸을 떠날 때 검사). 자비스 모드는 스킬을 쓴 답에 "k-skill ○○로 찾아봤어요" 알림 (index.html, jarvis.html, /api/skills*)
- [x] T307 아침 브리핑 날씨: 날씨 스킬을 켜고 기본 위치가 있으면 단기예보를 브리핑 자료에 넣음
- [ ] T308 실제 k-skill 조회 서버(k-skill-proxy.nomadamas.org)로 한 번 확인 — 외부 전송이라 사용자 확인 뒤
- [ ] T309 사이트를 직접 여는 조회 스킬(로또·KBO·K리그·열차 시간표 등 25개)과 예약·결제·로그인 스킬은 아직 연결 안 함(주소가 정해지지 않은 외부 접속이라 따로 안전 설계·승인 필요)

## Phase 26: 2026-11-14 디자인 계획 v4 (사용자 지시: Figma·Higgsfield 사용, 계획 잡고 진행)

- [x] T310 디자인 계획 문서 docs/design-plan.md
- [x] T311 Figma 파일 "JARVIS Hybrid 2.0 — 디자인"(https://www.figma.com/design/5FJuECJXu9UZ8cPXJyhLs0): 00 계획 / 01 기초(색 15개 밝음·어두움, 간격 6, 둥글기 4, 글자 스타일 8, 웹 코드 이름 var(--…)) / 02 부품(Button 3변형, IconButton 2, Badge 4, Bubble 2, Card, Tile, CheckRow, ConfirmDialog — 모두 변수에 묶음) / 03 화면(대기·밝음, 부르면 대답하기·말하는 중·어두움, 쉬는 화면, 스킬 동의 창) / 04 캐릭터(자비 상태 시트)
- [x] T312 오리지널 캐릭터 "자비"(귤에서 떠올린 둥근 몸): Higgsfield GPT Image 2.6으로 기본 4안 → 1안 고름 → 같은 모습으로 듣는 중·생각 중·말하는 중 1·2. 5장을 같은 크기·같은 가운데(512px, 투명 PNG)로 맞춰 src/character/mascot에 넣음
- [x] T313 앱 반영: 친구 고르기 맨 앞 "오리지널" 묶음에 자비(미리 보기 그림), 고르면 그 캐릭터에 그림 얼굴 5장이 자동으로 들어감(이미 그림이 있으면 덮지 않음). /static/mascot/*.png 제공
- [x] T314 앱 아이콘(안드로이드 런처)에 자비 넣기 — 2026-11-15 자비 대기 그림(src/character/mascot/jabi/idle.png)을 둥근 바탕에 얹어 mipmap 5종(android/res/)
- [x] T315 과일·간식 친구 12명(오리지널): 사용자가 치이카와·산리오 실제 그림을 원했으나 원작 그림은 만들지 않기로 하고(검색해 가져오기·따라 그리기 포함), 사용자가 고른 대안 "분위기만 닮은 오리지널"로 진행. 치이카와·산리오 목록의 성격(말투)만 이어받고 모양·이름은 새로: 콩떡·소다·레몬·밤톨·딸기·복숭아·블루베리·구름빵·호떡·키위·청포도·가지. 그림은 자비 그림체로 Higgsfield에서 기본 모습(높은 품질) + 상태 4장(중간 품질, 기본 모습 참고)씩 60장, 512px로 맞춰 src/character/mascot/<key>/. 친구 고르기 "오리지널" 묶음(자비 + 12명), 고르면 그림 얼굴 자동 적용. 치이카와·산리오 이름 목록은 그대로(도형 얼굴, 사용자가 권리 있는 그림을 넣을 수 있음)
- [x] T316 동물 친구 10마리로 다시 그림(사용자 요청 "곰, 카피바라, 나무늘보, 고양이, 강아지, 원숭이, 기니피그, 피카츄, 꼬부기, 여우 … 엄청 귀엽게"): 과일 친구 12명을 빼고 곰돌·카피·늘보·나비(고양이)·콩이(강아지)·몽이(원숭이)·기니(기니피그)·토리(햄스터)·솔이(초록 거북이)·여우비(여우)로 교체. 피카츄·꼬부기는 포켓몬 원작 캐릭터라 그리지 않고 햄스터·초록 거북이로 바꿈(전기·빨간 볼·파란색·꼬리 소용돌이 같은 특징 없이). 말투는 치이카와·산리오 목록에서 이어받음. Higgsfield 기본 10장(높은 품질) + 상태 40장(중간 품질), 512px로 맞춰 src/character/mascot/<key>/
- [ ] T283 치이카와 그림 넣기 — 그림은 사용자가 쓸 권리를 확인하고 설정 모드 → 캐릭터 → 그림 얼굴에서 직접 넣어야 함(이 작업에서는 그리거나 받아 오지 않음)

### 2026-11-14 자비스 모드 확인 (Windows, 외부 전송·실제 소리·마이크·카메라 켜기 없음)

- 실제 서버(시험 데이터 `work/qa-real-20261114`, `--host 192.168.0.53`)에서 이 PC 내장 브라우저로 `/jarvis`를 열어 치이카와 얼굴·상태·대화(실제 Ollama gemma4:12b 답 "우와... 안녕! 기분은 아주 좋아!")를 확인. 상태가 생각 중 → 대기로 바뀜.
- 장치 점검(이 PC 내장 브라우저 기준): 보안 연결·서버(8ms)·화면·터치·네트워크·전원·진동 확인, 장치 목록 마이크 0·카메라 0·스피커 1(이 PC에 마이크 없음과 일치), 움직임 센서 값 없음. 마이크·카메라·스피커 시험 단추는 누르지 않음(실제 장치 켜짐·소리 금지).
- 와이파이 주소(`http://192.168.0.53:47989/jarvis`)로 열면 보안 연결이 아니라 말하기 단추가 숨고, 마이크·카메라 점검은 "보안 연결 필요"로 안내됨(실제 확인). 휴대폰에서 설정 모드 화면이 열리는 것은 사용자가 확인.
- 검사: test/server.test.js에 2개 추가(자비스 모드 화면 보안 머리글·외부 자원 없음, 외부 접속 옵션). `npm test` 267개 모두 통과.
- 미검증: 토스 기기에서 자비스 모드 열기(브라우저 여부 미확인), 실제 마이크·카메라·스피커 시험(사람이 눌러야 함), 보안 연결.

## Dependencies

T030 → T031~T033 → US2(T040~T045) → Quick Actions(T050~T052). 기억(T060~)과 공급자(T070~)는 T031 이후 병렬 가능.
공급자 어댑터(T090~) → 전송 승인(T100~) → 화면(T130~). 끼어들기(T110~) → 음성 출력(T140~) → 화면 연결(T145) → 캐릭터(T150~).
회의 규칙(T120~)은 독립. 삭제 정리(T160)는 기억·캐릭터·회의 이후.
막힌 일(2026-11-14 갱신): 원본(T007·T010·T097·T105·T155), 키(T096), Mac(T137·T146·T112·T204·T213), 마이크(T218·T220·T230·T231·T235), 사용자 청취(T148·T156), 기기(T020), 두 기기 실측 뒤(T206).
MVP: Phase 3까지.

## 실행 기록

2026-11-13, Windows 11, Node 24.19.0, SQLite 3.53.3. 모두 모의·로컬 검사이며 Mac·실제 API·기기 검증 아님.

| 명령 | 결과 |
| --- | --- |
| `node:sqlite` 열기·버전 조회 | SQLite 3.53.3, 경고 출력 없음 |
| `npm test` 1회차 | 실패: package.json의 따옴표 오류(EJSONPARSE) → 수정 |
| `npm test` 2회차 | 실패: Windows에서 열린 DB 폴더를 먼저 지우려다 EPERM (검사 정리 순서 문제) |
| 수정 | test/helpers.js 임시 폴더 삭제를 프로세스 종료 때로 이동 |
| `npm test` 재실행 5회 | 매회 37개 통과, 0개 실패 (다중 프로세스 8개 동시 실행 포함). 이후 실행은 임시 폴더를 남기지 않음 |
| CLI 수동 흐름(임시 DB) | quick run → 승인 전 run: approval_required → approve → run: done → 재실행: invalid_state(종료 코드 1). memory add/search 정상 |

검사 파일: test/missions.test.js(14), quick.test.js(5), memory.test.js(6), providers.test.js(7), cli.test.js(4), multiprocess.test.js(1).

### 2026-11-13 공급자 어댑터

| 명령 | 결과 |
| --- | --- |
| `node --test test/adapters.test.js` | 13개 첫 실행 통과 |
| 외부 차단 조건을 일부러 끈 변이 검사 | "외부 주소로 보내지 않는다" 검사가 실패함을 확인 후 원상 복구, 다시 13개 통과 |
| `npm test` 3회 | 매회 50개 통과, 0개 실패 |

실제 API·실제 Ollama 호출은 하지 않았다. 검사는 127.0.0.1 가짜 서버와 가짜 fetch만 사용.

### 2026-11-13 Ollama 로컬 실제 검사 (사용자 승인 후)

환경: Windows 11, Ollama 0.40.14(이미 실행 중), 모델 gemma4:12b. 고정 문장만 보냄, 개인 자료 없음, 외부 전송 없음.

| 명령 | 결과 |
| --- | --- |
| `curl 127.0.0.1:11434/api/version`, `/api/tags` | 0.40.14, 모델 10개 확인 |
| `node scripts/ollama-smoke.js gemma4:12b` 1회차 | 3/3 통과. 한국어 응답 정상, 첫 글 조각 13.3초(모델 첫 로드 포함), 전체 13.8초, 조각 47개 |
| 같은 명령 2회차 | 3/3 통과. 첫 글 조각 6.5초, 전체 7.0초 |
| 취소 검사 | 첫 조각 뒤 취소 → cancelled, 취소 뒤 조각 0개 |
| 없는 모델 | not_found |
| 원본 스트림 앞 3줄 확인 | gemma4가 답 전에 `message.thinking`을 먼저 보냄. 어댑터는 이를 버리고 `content`만 조각으로 냄 → 첫 글 조각까지 걸리는 시간 대부분이 생각 시간 |

실패 없음, 코드 수정 없음. 지연 수치는 Windows 한 번 측정값이며 M1 Max 기준이 아니다.

### 2026-11-13 클라우드 연결 준비 (API 키 방식, 사용자 선택)

| 명령 | 결과 |
| --- | --- |
| 프로젝트용 `claude auth status` | loggedIn=false. Codex CLI는 PC에서 찾지 못함. 데스크톱 앱 로그인 정보는 쓰지 않음(규칙) |
| 환경 변수 확인(값 미출력) | ANTHROPIC_API_KEY·OPENAI_API_KEY·XAI_API_KEY 모두 없음 |
| `node scripts/cloud-smoke.js claude openai` | 계획만 표시, 전송 0회 |
| `node scripts/cloud-smoke.js claude --yes-send` (수정 전) | **결함**: 키가 없는데 "틀린 키" 검사가 api.anthropic.com에 요청 1회를 보냄(고정 시험 문장 + 일부러 틀린 키, 개인 자료 없음, 401 응답). 걸린 시간이 0ms로 찍히는 버그도 있음 |
| 수정 | 키·모델 없으면 그 공급자는 사전 확인에서 멈추고 0회 전송. 시간 측정 순서 수정 |
| 같은 명령 (수정 후) | 두 공급자 모두 "보내지 않음", 전송 0회 |
| 가짜 로컬 서버로 스크립트 전체 흐름 검증 (scratchpad 도구) | 6/6 통과, 가짜 서버 요청 6회 |
| `npm test` | 50개 통과 |
| 사용자 "키 넣음" 후 확인 (2026-11-13) | 프로젝트 폴더에 `.env.local` 없음, `.env.local.example` 값 비어 있음, 사용자·시스템 환경 변수에도 키 없음 → 실행하지 않음, 전송 0회 |

### 2026-11-13 형식 대조 (T094)

| 출처 | 확인 내용 | 어댑터와 비교 |
| --- | --- | --- |
| platform.openai.com API 참조 | HTTP 403으로 읽지 못함 | 미확인 |
| openai-cookbook How_to_stream_completions | `chat.completion.chunk`, `choices[].delta.content`, 첫 조각 `delta.role`, 끝 조각 `finish_reason: stop`, usage 조각은 `choices: []` | 일치. 빈 choices도 처리됨 |
| docs.x.ai 스트리밍 안내 | `POST https://api.x.ai/v1/chat/completions`, `stream: true`, `data: [DONE]`로 끝, 생각은 `delta.reasoning_content` | 일치. 생각 조각은 버림(T097과 같은 문제) |
| ollama docs/api.md | `/api/chat`, NDJSON, `message.content`·`message.thinking`, `done`·`done_reason`, `think` 옵션 | 일치 |
| 로컬 Ollama 직접 확인 | 없는 모델: HTTP 404 + `{"error":"model '...' not found"}`. `think:false`면 생각 없이 바로 `content` 조각 | 404 → not_found 일치. `think` 옵션은 T097 결정 때 반영 |

코드 수정 없음. 남은 불확실성: OpenAI 공식 API 참조 원문 미확인.

### 2026-11-13 개인 자료 외부 전송 승인 (잠정안, 사용자 지시)

| 명령 | 결과 |
| --- | --- |
| `npm test` | 62개 통과 (새 검사 12개 포함), 첫 실행 통과 |
| 변이 검사: 외부 판정 조건을 항상 바로 보내기로 바꿈 | transfer 검사 7개 실패 → 결함을 잡음, 원상 복구 |
| 변이 검사: 기억 해시 확인을 끔 | "승인 뒤 기억 변경" 검사 실패 → 결함을 잡음, 원상 복구 후 11개 통과 |

실제 외부 전송 없음. 기록용 가짜 공급자와 외부 허용 꺼진 CLI만 사용.

### 2026-11-13 끼어들기 차례 관리 로직

| 명령 | 결과 |
| --- | --- |
| `node --test test/turns.test.js` | 9개 첫 실행 통과 |
| 변이 검사: 옛 차례 조각 필터를 끔 | 2개 실패 → 결함을 잡음, 원상 복구 |
| 변이 검사: 끼어들기 때 재생 중지를 끔 | 2개 실패 → 결함을 잡음, 원상 복구(백업과 동일 확인) |
| `npm test` 5회 | 매회 71개 통과, 0개 실패 (시간 의존 검사 흔들림 없음) |

가짜 재생기·모의 공급자만 사용. 마이크·스피커·실제 지연은 미검증.

### 2026-11-13 회의 기록 시간·삭제 규칙

| 명령 | 결과 |
| --- | --- |
| `node --test test/meetings.test.js` | 10개 첫 실행 통과 |
| 변이 검사: 순서 검사를 끔 | 1개 실패 → 결함을 잡음, 원상 복구 |
| 변이 검사: 멈출 때 길이 자르기를 끔 | 1개 실패 → 결함을 잡음, 원상 복구(백업과 동일 확인) |
| `npm test` 3회 | 매회 81개 통과, 0개 실패 |

가짜 원음 파일만 사용. 실제 녹음·전사·재생은 미검증.

### 2026-11-13 Windows·macOS 각각 실행용 로컬 화면

| 명령 | 결과 |
| --- | --- |
| `node --test test/server.test.js` | 10개 첫 실행 통과 |
| `node src/main.js --port 4780 --data <임시 폴더>` (Windows 11) | 실행, `netstat`로 127.0.0.1:4780에만 열림 확인 |
| 내장 브라우저로 화면 조작 | 기억 저장, 빠른 작업 요청→승인→실행(완료), 대화에서 claude+기억 → 승인 대기와 보낼 내용 미리 보기 확인. 실제 외부 전송 없음 |
| 발견한 결함 | 목록을 동시에 여러 번 불러오면 같은 작업이 두 번 보임 → 마지막 요청만 반영하게 모든 목록 수정, 3회 동시 호출로 1개만 보임 확인 |
| 개선 | 대화 기본 공급자를 이 기기 안 공급자(ollama)로 |
| 콘솔 오류 | 없음 |
| 실행 중 서버에 curl | 토큰 없는 API 403, 다른 Host 421 |
| `npm test` 3회 | 매회 91개 통과 |

macOS에서는 실행하지 않았다(T137).

### 2026-11-13 음성 출력 계층

| 명령 | 결과 |
| --- | --- |
| PowerShell `GetInstalledVoices()` | Microsoft Heami Desktop(ko-KR), Zira(en-US) |
| `node --test test/voice.test.js` 1회차 | 8 통과 1 실패: 문장 자르기 검사의 기대값이 틀림(10자 안 마지막 띄어쓰기 기준이면 "하나 둘 셋 넷"이 맞음) → 검사 수정 후 9개 통과 |
| `node scripts/tts-smoke.js <임시 폴더>` 1회차 | 3/4 통과. 끊기 검사 실패: 파일 합성이 0.77초 만에 끝나 0.8초 뒤 끊기가 늦음(검사 설계 문제) |
| 검사 수정(더 긴 글, 0.15초에 끊기) 후 2회 | 4/4 통과. 한국어 WAV 6.54초 분량을 0.4~0.5초에 합성, 특수 문자 포함 글 합성, 끊기 0.17~0.19초 |
| 남은 합성 프로세스 확인 | 0개 |
| WAV 소리 크기 | RMS 2776, 최대 19057 (무음 아님). 실제 청취는 안 함 |
| 변이 검사: 멈출 때 끊기를 끔 | 3개 실패 → 결함을 잡음, 원상 복구 |
| 변이 검사: 멈출 때 남은 문장 버리기를 끔 | 통과(같은 결과 변이: stopped 표시가 이미 다음 문장을 막음) |
| `npm test` 3회 | 매회 100개 통과 |

스피커로 말하기(--speak)는 실행하지 않았다. macOS는 미검증.

### 2026-11-13 화면 대화 ↔ 음성 출력 연결

| 명령 | 결과 |
| --- | --- |
| `node --test test/voice-server.test.js` 1회차 | 7 통과 1 실패: "새 질문 시 옛 답 끊기" 검사에서 가짜 스피커가 30ms 만에 첫 문장을 끝내 끊을 대상이 다른 문장이 됨(검사 시간 설정 문제) |
| 검사 수정(문장 읽기 150ms, 끊긴 뒤 새 답 세 문장만 읽는지 확인) | 3회 연속 8개 통과 |
| 화면 확인(Windows, 임시 데이터) | 대화 탭에 소리 읽기(꺼짐)·말 멈추기·상태 표시, 말 멈추기 → "멈출 말이 없음", 콘솔 오류 없음. 소리 읽기는 켜지 않음(실제 소리 없음) |
| `npm test` 3회 | 매회 108개 통과 |

### 2026-11-13 캐릭터 설정

| 명령 | 결과 |
| --- | --- |
| 화면 코드 수정 중 실수 | bash 안의 템플릿 문자열이 명령으로 해석돼 index.html 캐릭터 부분이 깨짐 → 직접 고침, 스크립트 문법 검사·깨진 조각 검색으로 확인 |
| `node --test test/characters.test.js` | 10개 첫 실행 통과 |
| 변이 검사: 말투 넣기 끔 | 2개 실패 → 잡음, 원상 복구 |
| 변이 검사: 캐릭터 목소리 무시 | 1개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 118개 통과 |
| 화면 확인(Windows, 임시 데이터) | 목소리 목록에 Heami·Zira 실제 표시, 캐릭터 저장(자산 출처·이용 조건 포함)·적용, 대화 상태 "자비 · 소리 읽기 꺼짐 · 상태 대기", 콘솔 오류 없음. 미리 듣기는 누르지 않음(소리 없음) |
| 서버 재시작 후 | 적용 캐릭터 "자비" 유지 확인 |

### 2026-11-13 문서 일관성 분석과 삭제 자료 정리

| 명령 | 결과 |
| --- | --- |
| `/speckit-analyze` (읽기 전용) | 중대 C1(헌법 III), 높음 I1, 보통 I2~I5·U1, 낮음 I6. FR 13개 모두 작업 있음 |
| C1 실측(임시 DB) | 기억 삭제 뒤 원문 바이트가 `-wal`에 남고, 닫은 뒤 본 파일에도 남음 |
| 수정 후 `node --test test/secure-delete.test.js` | 4개 통과(열린 상태·닫은 뒤, 수정 전 내용, 캐릭터, 녹취) |
| 변이: secure_delete 끔 | 3개 실패 → 잡음 |
| 변이: WAL 비우기 끔 | 4개 실패 → 잡음, 원상 복구(백업과 동일) |
| `npm test` 3회 | 매회 122개 통과 |
| 문서 수정 | spec 단계 구분·사용자 이야기 상태·Key Entities·FR-010b·FR-013 수용 위험, plan 요약·제약·단계·구조, quickstart, tasks 연결·의존성 |
| 사용자 "키 넣고 클라우드 검사" 후 확인 | `.env.local` 수정 시각이 만든 때(22:39) 그대로, 세 칸 모두 비어 있음. 환경 변수(프로세스·사용자·시스템)에도 없음 → 실행하지 않음, 전송 0회 |

### 2026-11-14 경계 상황 QA (클라우드 전송·소리·녹음 없음, .env.local 값 미출력)

| 단계 | 결과 |
| --- | --- |
| 시작 전 `npm test` | 122개 통과 |
| 임시 폴더 탐색 스크립트(127.0.0.1 가짜 서버·가짜 공급자) | 재현: D1 본문 null → 모든 API 500, 숫자·배열로 빠른 작업 생성 / D2 빠른 작업 글의 키 형태가 작업 DB에 저장 / D3 캐릭터 수정 뒤 옛 말투가 DB·WAL에 남음 / D4 말 멈추기·새 질문으로 끊긴 대화가 옛 답 "첫 문장."을 돌려줌 / D5 1MB 초과 요청이 ECONNRESET / D6 녹취 시간 1e300 수락. 아주 큰 ID는 404로 정상 |
| 사용자 보고 D7 | 승인 뒤 공급자 주소 변경 시 그대로 'done', 재시작+환경 설정 변경 시에도 바뀐 주소로 전송 → 재현 |
| 사용자 보고 D8 | 승인 주소의 서버가 307로 다른 127.0.0.1 서버를 가리키면 따라가서 전송 → 재현 |
| 수정 전 새 검사 | 17개 모두 실패(재현 확인) |
| 수정 후 새 검사 | 17개 통과 |
| 변이: 실행기 대상 확인 끔 / 리디렉션 따라감 / 본문 형식 검사 끔 | 6개 / 1개 / 1개 실패 → 결함을 잡음, 원상 복구(백업과 동일 확인) |
| `npm test` 3회 | 매회 139개 통과 |
| 탐색 스크립트 재실행 | 본문 형식 400, 큰 ID 400, 키 형태 400·파일에 없음, 옛 말투 파일에 없음, 끊긴 답 글 비움, 1MB 초과 413, 1e300 거부 |
| 정리 | 탐색용 임시 폴더 2개 삭제 |

미검증 유지: 원본 대조, macOS 실행, 클라우드 실제 전송, 마이크·녹음, 실제 청취.

### 2026-11-14 글 대화 멈추기

| 단계 | 결과 |
| --- | --- |
| 수정 전 `node --test test/text-stop.test.js` | 4개 실패: 소리 읽기를 끈 대화는 멈추기를 눌러도 끝까지 생성(stoppedChats 없음) → 재현 |
| 수정 후 | 4개 통과 |
| 변이: 멈추기에서 취소 신호 끔 | 2개 실패 → 잡음, 원상 복구(백업과 동일) |
| `npm test` 3회 | 매회 143개 통과 |
| 로컬 Ollama(gemma4:12b) 실제 | "1부터 300까지" 요청을 2.5초에 멈춤 → stoppedChats 1, interrupted, 답 글 0자(버림), 다음 대화 정상. 외부 전송·소리 없음 |

### 2026-11-14 화면 수정 빈틈 채우기

| 단계 | 결과 |
| --- | --- |
| 화면 스크립트 문법 검사 | 정상 |
| 내장 브라우저(Windows, 임시 데이터) 캐릭터 수정 | 기존 값으로 양식이 열림 → 자산 줄 추가 후 이용 조건 비워 저장 → "자산 2 이용 조건이(가) 비어 있음"으로 거부, 양식·입력 유지, 저장 안 됨 → 이용 조건 채워 저장 → 말투 변경·자산 2개·목소리·적용 상태 유지 확인 |
| 내장 브라우저 기억 태그 수정 | " 취향, 음료 ,  아침 " → ["취향","음료","아침"]로 저장, "아침"으로 검색됨, 태그 비우기 → [] |
| 콘솔 | 일부러 낸 400 거부 1건 외 오류 없음 |
| `node --test test/edit-api.test.js` | 2개 통과 |
| `npm test` 3회 | 매회 145개 통과 |

### 2026-11-14 Windows 지연 기준 실측 (SC-005 일부, 소리·외부 전송·마이크 없음)

환경: Windows 11(10.0.26200), AMD Ryzen 7 9800X3D(16 스레드), 메모리 101GB, Node 24.19.0, Ollama gemma4:12b, 음성 Microsoft Heami.
명령: `node scripts/latency-check.js <임시 폴더> --model gemma4:12b --runs 3` (종료 코드 0, 임시 WAV 폴더 자동 삭제, 남은 합성 프로세스 0)

| 항목 | 1회(첫 로드) | 2회 | 3회 | 중앙값 |
| --- | --- | --- | --- | --- |
| 질문 → 첫 글 조각 | 18163ms | 6605ms | 5168ms | 6605ms |
| 질문 → 첫 문장 소리 준비(WAV 합성 끝) | 19424ms | 7557ms | 6181ms | 7557ms |
| 첫 문장 합성 시간 | 949ms | 483ms | 498ms | 498ms |

| 끼어들기 3회 | 생성 멈춤 | 합성 멈춤 | 끊은 뒤 조각 | 끊은 뒤 새 문장 |
| --- | --- | --- | --- | --- |
| 결과 | 1~2ms | 6~16ms(중앙 6ms) | 0 | 0 |

JARVIS 프로세스: 메모리 66MB, CPU 한 코어의 약 2%(Ollama·합성 프로세스 제외).
해석: 첫 소리까지 시간의 대부분은 모델의 생각(thinking) 시간이다(T097). 합성 멈춤은 파일 합성 프로세스 종료 기준이며 실제 스피커 재생 멈춤은 청취로 확인해야 한다(T148). Mac은 미측정(T204).

### 2026-11-14 whisper.cpp 다운로드·받아쓰기 실측 (사용자 다운로드 허용)

| 단계 | 결과 |
| --- | --- |
| 다운로드 3개(curl) | whisper-cublas-12.4.0-bin-x64.zip 670,611,449B, ggml-large-v3-turbo-q5_0.bin 574,041,195B, ggml-silero-v6.2.0.bin 885,098B |
| sha256 대조 | 3개 모두 일치 |
| zip 경로 검사 | 항목 44개, 위험 경로 0개 → tools/whisper/v1.9.2 해제 |
| whisper-cli(CUDA) | 회의 문장 정확, "자비스"→"차비스" |
| whisper-server + 한글 프롬프트 | "오후"가 "오�"로 깨짐(바이트 ef bf bd) → 결함 재현 |
| 옵션 없는 서버 / 영문 프롬프트 | 깨짐 없음, 영문 프롬프트로 "자비스" 정확 → 원인 확정 |
| VAD 켬/끔 무음 3초 | 켬: 빈 글 / 끔: "RVIS" 지어냄 |
| `node scripts/stt-smoke.js ... --vad-model ...` | 3/3 통과(회의 203ms, 이름 66ms, 무음 11ms 빈 글), 끝난 뒤 서버 꺼짐 확인 |
| 서버 Host 검사 | 다른 Host도 200 → 연결 때 막아야 함(T212) |

마이크·녹음·소리 재생·외부 전송 없음. Mac 미검증(T213).

### 2026-11-14 받아쓰기 JARVIS 연결 (마이크·녹음·외부 전송 없음)

| 단계 | 결과 |
| --- | --- |
| 기존 `npm test` (연결 직후) | 145개 통과 |
| `node --test test/stt.test.js` | 13개 첫 실행 통과(ffmpeg 변환 포함) |
| 실제 whisper로 JARVIS 경유(임시 데이터, OS 합성 22kHz WAV 업로드) | 16kHz로 변환 후 받아쓰기: "차비스 내일 아침 9시에 알람 맞춰줘". 첫 회 1.44초(엔진 준비 포함), 둘째 0.15초. 서버는 127.0.0.1 임의 포트(63661), --vad·--prompt JARVIS로 실행 확인 |
| JARVIS 정상 종료 / node 강제 종료 | 두 경우 모두 whisper-server 0개 남음(Windows) |
| 변이: 띄우는 중 닫기 처리 끔 / 길이 제한 끔 | 각각 1개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 158개 통과 |

남은 것: 마이크 입력(T215, 녹음 승인), "자비스" 인식(T216), macOS에서 강제 종료 시 자식 서버 정리(미검증), Mac 설치·확인(T213).

### 2026-11-14 마이크 입력 (사용자 녹음 승인)

| 단계 | 결과 |
| --- | --- |
| `node --test test/voice-input.test.js` | 8개 통과(말 시작·끝, 딸깍 소리 무시, 짧은 쉼 유지, 최대 길이, 소음 기준 학습, 정적 스크립트·Host 검사·마이크 권한 정책) |
| 마이크 장치 확인(녹음 안 함) | ffmpeg dshow 녹음 장치 0개, Windows 오디오 장치는 출력(모니터·Realtek 스피커)만 → **이 PC에 마이크 없음** |
| 화면(내장 브라우저) "말하기" | 브라우저 입력 장치 0개 → "마이크를 찾지 못함. 마이크를 연결한 뒤 다시 누르세요." 표시, 마이크 열리지 않음 |
| 화면 결함 발견·수정 | 녹음 중이 아닌데 "● 녹음 중" 표시가 늘 보임(.badge display가 hidden 속성을 덮음) → [hidden] 규칙 추가, 녹음 중일 때만 보임 확인 |
| 듣기 모드(장치 없음) | 체크가 다시 풀리고 같은 안내 표시 |
| 변이: hidden 규칙 제거 / 말 시작 지속 시간 무시 | 1개 / 2개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 166개 통과 |

실제로 말해서 녹음·받아쓰기·끼어들기 하는 확인은 마이크가 없어 하지 못함(T218). 녹음 파일은 만들지 않았다.

### 2026-11-14 이름("자비스") 받아쓰기 개선 (OS 합성 음성, 마이크·외부 전송 없음)

명령: `node scripts/name-check.js <임시 폴더> --server ... --model ... --vad-model ... --prompts "..." [--holdout]` (임시 WAV 자동 삭제)

| 프롬프트 | 기존 10문장 바로잡기 전 | 주요 오인식 |
| --- | --- | --- |
| JARVIS(현재) | 8/10 | 차비스 ×2 |
| 없음 | 6/10 | 차비스 ×4 |
| Jarvis | 8/10 | 차비스 ×2 |
| JARVIS is the name of the assistant. | 7/10 | 차비스, Javis, CHAVIS |

| 문장 묶음(프롬프트 JARVIS) | 바로잡기 전 | 바로잡은 뒤 |
| --- | --- | --- |
| 기존 10문장 | 8/10 | 10/10 |
| 규칙을 고를 때 안 쓴 새 10문장 | 10/10 | 10/10(망가짐 없음) |

| 검사 | 결과 |
| --- | --- |
| `node --test test/stt.test.js` | 16개 통과(바꾸면 안 되는 말: 차비 스타일·자비로운·차 비스킷·서비스 센터·Jarvisian 유지) |
| 변이: 바로잡기 끔 | 2개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 169개 통과 |

한계: 합성 음성 20문장 기준이다. 사람 목소리·사투리·잡음 환경은 미검증(T220).

### 2026-11-14 빠른 답(생각 생략) 비교 (Windows, Ollama gemma4:12b, 소리 없이 WAV 합성, 외부 전송 없음)

명령: `node scripts/latency-check.js <임시 폴더> --model gemma4:12b --runs 4 [--think false]`

| 방식 | 질문 → 첫 글(중앙값) | 질문 → 첫 소리 준비(중앙값) | 끼어들기 생성/합성 멈춤 |
| --- | --- | --- | --- |
| 모델 기본값(생각함) | 7146ms (첫 회 13072ms) | 8069ms | 1ms / 8ms |
| 빠른 답(think:false) | 77ms | 1255ms | 1ms / 2ms |

답 비교(질문 "하늘이 파란 이유를 두 문장으로"): 두 방식 4회 모두 "레일리 산란"과 짧은 파장의 파란 빛 산란을 정확히 설명. 질문 1개 기준이라 복잡한 질문의 품질 차이는 미검증.

| 검사 | 결과 |
| --- | --- |
| `node --test test/fast-answer.test.js` | 3개 통과 |
| 변이: 빠른 답 전달 끔 | 첫 시도에서 검사 프로그램이 멈춤 → 원인: 검사 실패 시 시험 서버를 닫지 않음(검사 코드 결함). 변이된 파일은 즉시 원상 복구(백업과 동일 확인) 후, 실패해도 서버를 닫게 검사 수정 → 다시 변이: 1개 실패로 잡음, 멈춤 없음 |
| `npm test` 3회 | 매회 172개 통과 |

### 2026-11-14 빠른 답 기본 켬 (사용자 결정)

| 단계 | 결과 |
| --- | --- |
| 변경 | 설정이 없으면 빠른 답 켬(src/app/services.js). 사용자가 끈 값은 저장돼 재시작 후에도 꺼짐 |
| `node --test test/fast-answer.test.js` | 4개 통과(기본 켬, 끄면 think 안 보냄, 끈 값 유지, 처음 설치 켬, 외부 전송 미션 분리) |
| `npm test` 3회 | 매회 173개 통과 |

### 2026-11-14 빠른 답 품질 비교 (Windows, Ollama gemma4:12b, 외부 전송 없음)

명령: `node scripts/quality-check.js --model gemma4:12b --rounds 2 [--hard]` (정답이 정해진 한국어 질문, 정규식으로 채점)

| 묶음 | 생각함 정답 / 중앙 시간 | 빠른 답 정답 / 중앙 시간 |
| --- | --- | --- |
| 쉬운 10문제 × 2 (계산·상식·간단 추론) | 20/20 / 7706ms | 20/20 / 411ms |
| 어려운 10문제 × 2 (함정·여러 단계) | 20/20 / 6097ms | 18/20 / 703ms |

빠른 답 오답: "4로 나누면 몫 7, 나머지 3인 수"를 두 번 모두 "4 × 7 = 20"으로 잘못 계산해 23이라고 답함(정답 31).
해석: 빠른 답은 8~19배 빠르지만 여러 단계 계산에서 실수할 수 있다. 문제 40개·모델 1개 기준이라 일반화에는 한계가 있다.

### 2026-11-14 계산·추론 질문 자동 생각함 (Windows, Ollama gemma4:12b, 외부 전송 없음)

규칙 만들기: 어려운 문제·일상 대화 목록으로 `test/reasoning.test.js` 작성 → 첫 실행에서 2개 놓침("며칠째", "9.11과 9.9 중 더 큰 수") → 규칙 추가 후 통과.

명령: `node scripts/quality-check.js --model gemma4:12b --rounds 2 --set <묶음>`

| 묶음 (각 20번) | 생각함 | 빠른 답 | 자동 (생각함으로 보낸 비율) |
| --- | --- | --- | --- |
| hard (규칙 만들 때 참고) | 20/20, 3833ms | 18/20, 524ms | 20/20, 3849ms (18/20) |
| holdout 새 계산 문제 | 20/20, 3133ms | 20/20, 396ms | 20/20, 3833ms (18/20) |
| casual2 새 일상 질문 | 8150ms | 327ms | 312ms (0/20) |

- 빠른 답 오답은 이번에도 "4로 나누면 몫 7, 나머지 3"(33, 29로 답함). 자동은 이 문제를 생각함으로 보내 맞힘.
- 자동이 놓친 유형: "세 사람이 악수하면 몇 번"(hard), "8을 빼고 2를 곱했더니"(holdout). 둘 다 빠른 답으로도 정답. 새 문제 결과를 그대로 두려고 규칙을 다시 고치지 않음(T226).

| 검사 | 결과 |
| --- | --- |
| 변이: 자동 생각 끔 | 2개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 178개 통과 |

### 2026-11-14 회의 음성 파일 가져오기 (Windows, whisper.cpp, 소리 재생·녹음·외부 전송 없음)

시험 파일: OS 합성 음성 문장을 WAV로 만들고(소리 안 냄) ffmpeg로 무음을 끼워 붙임. 예상 시작은 각 WAV 길이로 계산.

| 파일 | 예상 시작(ms) | 결과 구간 시작(ms) | 비고 |
| --- | --- | --- | --- |
| 3문장 + 무음 2초씩 (18.9초), 처음(VAD 켬) | 0, 7099, 13408 | 100, 14510 (구간 2개, 문장 경계와 안 맞음) | 결함 |
| 같은 파일, 수정 후 | 0, 7099, 13408 | 0, 7200, 13500 (차이 0~101ms) | 처리 0.3초 |
| 2문장 + 무음 15초 + 끝 무음 8초 (32.4초) | 0, 20099 | 0, 19520 (차이 579ms) | 끝 무음의 "감사합니다." 1개 뺌 |

- 찾은 결함: whisper.cpp v1.9.2는 VAD를 켜면 구간 시간을 무음을 뺀 시간으로 돌려준다(단어 시간 "둘째" 7.14초, 실제 13.4초). 요청마다 `vad=false`를 보내도 시간이 맞지 않았다.
- 고침: 회의 파일은 VAD 없는 엔진을 따로 띄워 받아쓴다(처음 가져올 때만 뜸, JARVIS 종료 때 끔). VAD 없이는 무음에서 "감사합니다."를 지어내서, 구간 안 50ms 창 RMS 최댓값이 300 미만이면 뺀다.
- 순서·길이 규칙: 두 파일 모두 시작 0 이상, 차례대로, 끝이 길이 이하.
- 화면: 회의 탭에 구간 표시, "00:07"을 누르면 원음 7.2초 위치로 이동(소리 끔·재생 함수 막고 확인). 끈 뒤 남은 whisper-server 없음.

| 검사 | 결과 |
| --- | --- |
| 변이: 무음 구간 빼기 끔 | 1개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 184개 통과 |

한계: 합성 음성과 디지털 무음 기준이다. 잡음 위에 지어낸 말은 소리 크기로 못 뺄 수 있다(T230). 회의용 엔진이 떠 있는 동안 받아쓰기 엔진이 두 개라 메모리를 더 쓴다.

### 2026-11-14 듣기 모드 에코 대책 (T219, Windows, 소리 재생·실제 마이크·외부 전송 없음)

원인: JARVIS는 OS 음성 합성(브라우저 밖)으로 말해서, 브라우저 에코 제거(echoCancellation)가 그 소리를 지우지 못한다. 듣기 모드는 소리가 들리면 바로 읽던 답을 멈췄다.

대책: JARVIS가 말하는 중에 소리가 들리면 바로 멈추지 않는다. 처음 1.5초를 받아 적어(`POST /api/stt?echo=check`) 방금 읽은 글(최근 8문장, 메모리에만)과 두 글자 묶음 겹침을 본다. 60% 이상이면 에코로 보고 그 녹음을 버린다(1초 쉼). 다르거나 "멈춰·그만·잠깐" 같은 말이 있거나 판단이 실패하면 사용자 말로 보고 멈춘다. 말하기 버튼과 말하지 않을 때는 예전처럼 바로 멈춘다.

화면 확인 방법: 임시 실행기(스크래치 폴더, 프로젝트 밖)로 실제 whisper + 소리 없는 가짜 스피커(문장당 9초) + 모의 공급자를 띄우고, 브라우저 화면의 마이크를 합성 음성 WAV를 흘리는 가짜 스트림으로 바꿈(스피커로 내보내지 않음).

| 경우 | 결과 |
| --- | --- |
| A. 말하는 중, 읽는 문장과 같은 소리 | 2.4초에 "읽는 답 소리로 보여 무시함", 계속 말함(끊긴 문장 없음) |
| B. 말하는 중, 다른 말("자비스, 내일 회의 몇 시였지?") | 2.3초에 읽던 답 멈춤(killed), 질문 칸에 받아 적음 |
| C. 말하지 않을 때 같은 말 | 예전과 같음(확인 단계 없이 바로 녹음·받아쓰기) |

| 검사 | 결과 |
| --- | --- |
| `test/echo.test.js` 3개 (판단 규칙, 최근 문장 기억, API) | 통과 |
| 변이: 에코 판단을 늘 "아님"으로 | 2개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 187개 통과 |

한계:
- 말하는 중 끼어들기가 즉시(약 0.4초)에서 약 2.3초로 늦어진다(확인용 받아쓰기 시간).
- 실제 스피커 소리는 방 울림·잡음으로 받아쓰기가 더 틀릴 수 있어 일치율이 낮아질 수 있다(T231, 마이크 필요).
- 확인하는 동안 받아쓰기를 더 자주 돌린다(이 기기 안에서만).
- 녹음 시작 앞 약 0.4초가 빠져 "자비스,"가 빠지는 것을 이번에 봤다(T232, 예전부터 있던 한계). → 아래 T232에서 고침.

### 2026-11-14 녹음 앞부분 잘림 대책 (T232, Windows, 소리 재생·실제 마이크·외부 전송 없음)

원인: 듣기 모드는 말소리가 0.15초 이상 이어진 것을 알아챈 뒤에야 녹음(MediaRecorder)을 시작해서, 그 전에 지나간 말머리("자비스,")를 잃었다.

대책: 마이크 소리(PCM)를 늘 0.8초 미리 담아 두고(메모리에만, 지난 소리는 계속 버림), 듣기 모드 녹음을 시작하면 그 앞 소리부터 넣는다. 녹음은 MediaRecorder 대신 화면에서 바로 16kHz 모노 16비트 WAV로 만든다(서버에서 ffmpeg 변환 없음). 말하기 버튼은 누른 뒤 소리만 담는다. 소리 처리 노드는 소리 0으로만 출력에 이어 소리를 내지 않는다.

화면 확인(T219와 같은 임시 실행기, 실제 whisper + 소리 없는 가짜 스피커 + 가짜 마이크):

| 경우 | 결과 |
| --- | --- |
| 듣기 모드, 말하지 않을 때 "자비스, 내일 회의 몇 시였지?" | "자비스, 내일 후에 몇 시였지?" (고치기 전에는 "자비스,"가 빠짐). WAV 4.38초, 변환 없음 |
| 듣기 모드, 말하는 중 에코 | 2.2초에 무시, 계속 말함. 확인용 받아쓰기 "오늘 서울은 맑고 낮" |
| 듣기 모드, 말하는 중 다른 말 | 2.3초에 멈춤, "자비스, 내일 후에 몇 시였지?" |
| 말하기 버튼 | "자비스, 내일 회의 몇 시였지?", 끝난 뒤 마이크 놓음 |
| 화면 오류 기록 | 없음 |

"회의"→"후에"는 같은 파일을 그대로 받아 적어도 "회에"로 틀려서(합성 음성 인식 문제) 이번 변경 탓이 아니다.

| 검사 | 결과 |
| --- | --- |
| `test/pcm-capture.test.js` 7개 (WAV 형식, 0.8초 미리 담기, 말하기 버튼, 최대 길이, 녹음 중 WAV, 발화 감지와 함께, 표본 줄이기) | 통과 |
| 변이: 미리 담기 끔 | 3개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 194개 통과 |

한계:
- 실제 마이크(브라우저가 주는 표본 빈도, 잡음)로는 미검증(T218).
- 소리 처리에 ScriptProcessorNode(오래된 방식, 아직 모든 주요 브라우저 지원)를 쓴다. 표본 줄이기는 단순 평균이라 고음이 조금 섞일 수 있다.
- 미리 담은 0.8초에는 말 직전 소리(잡음·스피커 소리)도 들어간다.


### 2026-11-14 회의 마이크 녹음 (T233·T234, Windows, 실제 마이크·소리 재생·외부 전송 없음)

방식: 회의 탭 "마이크로 회의 녹음 시작". 화면이 마이크 소리를 조용한 틈(0.3초 이상)에서 15~30초 조각으로 잘라 16kHz WAV로 차례로 보낸다(`POST /api/meetings/:id/chunk`). 서버는 받자마자 원음 파일 뒤에 붙이고(화면·JARVIS가 꺼져도 그때까지 원음이 남음), 회의용 받아쓰기 엔진(VAD 없음)으로 받아 적어 녹음 시작 기준 시간으로 구간을 넣는다. 녹음 중에도 회의록이 화면에 쌓인다. 멈추면 남은 받아쓰기를 기다리고 원음 머리글 크기를 맞춘다. 녹음하는 동안 대화 탭 마이크(말하기·듣기 모드)는 쓰지 못한다.

결함과 수정: 첫 확인에서 조각마다 첫 문장의 시작이 조각 시작점으로 잡혔다(whisper가 앞 무음을 첫 구간에 넣음, 최대 2.5초 앞). 구간 앞 무음(RMS 300 미만 50ms 칸)을 건너뛰고 100ms 앞을 시작으로 하도록 고쳤다.

화면 확인(임시 실행기, 실제 whisper large-v3-turbo + 가짜 마이크, 합성 음성 6문장 약 40초):

| 문장 | 고친 뒤 시작(ms) | 실제 시작(ms) | 글 |
| --- | --- | --- | --- |
| 1 | 2550 | 2489 | 정확 |
| 2 | 9320 | 9172 | 정확 |
| 3 | 14710 | 14606 | 정확 |
| 4 (둘째 조각 첫 문장) | 20332 (고치기 전 18432) | 20280 | 정확 |
| 5 | 27832 | 27678 | 정확 |
| 6 (셋째 조각 첫 문장) | 35250 (고치기 전 33450) | 35227 | "두 시"→"2시" |

- 조각 3개, 조각 경계에서 잘린 문장 없음. 녹음 중 15~30초마다 회의록 표시. 멈춘 뒤 저장까지 0.2초. 원음 43.5초, 머리글 크기 일치.
- 녹음 중 화면을 새로 고침 → 회의가 "녹음 중"으로 남고 새 녹음은 409. "끊긴 녹음 마무리"를 누르면 받은 원음(18.0초)·구간 3개로 끝남.
- 화면 오류 기록: 자동 조작이라 나간다는 확인 창이 막힌 것과 일부러 낸 409만 있음. 확인 뒤 whisper-server 남은 것 없음.

| 검사 | 결과 |
| --- | --- |
| `test/meeting-live.test.js` 6개 (시간 이어 붙이기·녹음 중 다른 녹음/가져오기/지우기 막기·원음 내용, 앞 무음 건너뛰기, 받아쓰기 실패해도 원음 유지, 조각 형식, 꺼짐 뒤 복구·재생, 최대 길이) | 통과 |
| 변이: 조각 위치를 0으로 / 머리글 맞춤 끔 / 원음 붙이기 끔 | 각각 2·2·4개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 200개 통과 |

한계:
- 실제 마이크·사람 목소리·여러 화자·긴 회의는 미검증(T235). 무음 기준(RMS 300)은 합성 음성 기준이라 잡음이 크면 앞 무음 건너뛰기가 안 될 수 있다(그때는 whisper 시간 그대로).
- 화면을 닫으면 마지막 조각(최대 30초)은 저장되지 않는다. 조각 전송이 3번 실패하면 그 조각은 빠지고 뒤 시간이 앞당겨진다(화면에 알림).
- 받아쓰기가 실시간보다 느리면 화면에 조각이 쌓인다(이번 확인에서는 밀리지 않았고, 조각별 받아쓰기 시간은 따로 재지 않음).
- 외부 받아쓰기는 없다(T123, 전송 정책 확인 후).

### 2026-11-14 옛 DB 정리 명령 (T163, Windows, 외부 전송 없음)

방법: JARVIS를 끈 뒤 `npm run cli -- db compact` (다른 DB는 `--db 경로`). DB를 새로 써서(VACUUM) 빈 페이지를 없애고 WAL을 비운다. 결과의 `clean:true`를 확인한다.

발견: secure_delete 없이도 기억을 **모두** 지우면 페이지가 통째로 빠져 원문이 남지 않았다. 같은 페이지에 남은 기억이 있을 때 지운 칸, 그리고 고치기 전 내용이 파일에 남는다. 검사는 이 경우로 만들었다.

| 검사 | 결과 |
| --- | --- |
| 옛 DB(secure_delete 끔, 기억 사이사이 20개 삭제·1개 수정): 정리 전 원문 남음 → 정리 뒤 지운·고친 원문 0, 남긴 기억 22개 그대로 | 통과 |
| 다른 연결이 읽는 중: `clean:false`와 "JARVIS를 끈 뒤" 안내 | 통과 |
| 없는 DB: 만들지 않고 not_found | 통과 |
| 변이: VACUUM 끔 / clean 늘 true | 각각 2·1개 실패 → 잡음, 원상 복구 |
| 실제 명령(스크래치 DB) | clean:true, 없는 DB는 not_found |
| `npm test` 3회 | 매회 203개 통과 |

한계: 이 프로젝트에는 실제 사용자 DB(`data/`)가 없어 실제 자료로 정리해 본 적은 없다. 다른 연결이 읽는 중이면 기다리느라 약 5초 걸린다. 회의 원음 파일(WAV)은 이 명령의 대상이 아니다(회의 삭제 때 파일째 지움).

### 2026-11-14 자동 생각 판단 보완 (T226, Windows, Ollama gemma4:12b, 외부 전송 없음)

평가 방법: 규칙을 만드는 나와 따로, 다른 에이전트가 문제 묶음 두 개를 만들었다(실제 사용자 말투, 말로 쓴 수, 숫자가 있지만 계산이 아닌 일상 질문 포함).
- dev 묶음(계산 40·일상 40): 규칙을 고칠 때 봄.
- holdout 묶음(계산 50·일상 51): 규칙을 다 고칠 때까지 열지 않고, 고정한 뒤 한 번만 평가함.

| 묶음 | 예전 규칙 | 새 규칙 |
| --- | --- | --- |
| dev 계산 (잡은 수) | 16/40 | 40/40 (고칠 때 본 묶음) |
| dev 일상 (잘못 잡은 수) | 0/40 | 0/40 |
| **holdout 계산** | **27/50** | **40/50** |
| **holdout 일상** | **0/51** | **0/51** |

바꾼 것: 말로 쓴 수("삼천오백 원", "열두 개", "마흔다섯이고")를 수로 셈, 활용한 계산 동사("빼고", "곱했더니"), 거스름돈·약수·배수, 경우의 수, 거짓말 퍼즐, "N등은 누구", "다음에 오는 숫자", 단위 바꾸기("몇 밀리리터"), 퍼센트는 수가 있고 수량을 물을 때만("배터리 몇 퍼센트 남았어?"는 제외), "계산서"·"배수구"·"어떤 수업" 제외.
holdout에서 아직 놓친 10개: "…어떻게 돼?"로 묻는 나이·둘레·넓이, "다음에는 뭐가 와", "무슨 요일", "몇 가지", "제일 작은", 센티 단위(T236).

실제 답 비교(holdout 계산 50문제, 생각함·빠른 답 각 1번, `scratchpad` 임시 스크립트):

| 방식 | 맞힘 | 중간 시간 |
| --- | --- | --- |
| 생각함 | 49/50 (틀린 1개는 "25\pi"로 답해 정답 규칙에 안 맞은 것, 실제로는 맞음) | 12.2초 |
| 빠른 답 | 47/50 | 1.2초 |
| 자동(예전 규칙) | 49/50 | — |
| 자동(새 규칙) | 49/50 | — |

- 빠른 답이 틀린 3개(100일 뒤 날짜, 2시간 20분 뒤 시각, "삼 곱하기 사 더하기 오")는 예전 규칙도 이미 생각함으로 보냈다. 그래서 이 묶음에서는 정확도 차이가 없다.
- 새 규칙이 새로 생각함으로 보낸 13개는 빠른 답도 모두 맞혔고, 그 13개는 답이 약 1.4초 → 11.8초로 느려진다. 일상 질문은 그대로 빠른 답.
- 1번씩·모델 1개·50문제라 차이를 단정할 수 없다.

| 검사 | 결과 |
| --- | --- |
| `test/reasoning.test.js` 5개 (기존 3 + dev 전부, holdout 바닥값 40/50·오판 0) | 통과 |
| 예전 규칙으로 바꿔 돌리기 | 3개 실패 → 잡음, 원상 복구 |
| `npm test` | 205개 통과 |

사용자 결정(2026-11-14): 새 판단 규칙을 그대로 둔다(새로 잡은 계산 질문이 약 10초 느려지는 것을 받아들임).

### 2026-11-14 자동 생각 판단 2차 보완 (T236, Windows, 외부 전송·모델 호출 없음)

방법: T226과 같다. 세 번째 문제 묶음(계산 60·일상 61)을 다른 에이전트가 먼저 만들어 두고, 규칙을 다 고쳐 고정할 때까지 열지 않았다. 고칠 때는 두 번째 묶음(T226의 holdout)과 내가 만든 함정 문장만 봤다.

바꾼 것: 수가 둘 이상일 때 "어떻게 돼?·뭐가 와?·무슨 요일·몇 시·구해·맞혀·얼마나"로 묻는 것, 쉼표로 늘어놓은 수열(다음·뭐가 등을 물을 때만), "N일 뒤 무슨 요일·며칠", "고르는·뽑는·서는·앉는 방법", "A가 B보다 … B가 C보다 … 누구", 단위(일·밀리리터·센티·종류).
함정 확인으로 고친 것: "472번 버스 몇 시에 와?"(T226 규칙이 잘못 잡던 것, "몇 시에"를 수량 질문에서 뺌), "1, 2, 3 하면 사진 찍어 줘"(수열은 다음을 물을 때만).

| 세 번째 묶음(처음 본 문제) | 처음 규칙(T224) | T226 규칙 | 새 규칙(T236) |
| --- | --- | --- | --- |
| 계산 60개 중 잡은 수 | 30 | 44 | **55** |
| 일상 61개 중 잘못 잡은 수 | 0 | 0 | **0** |

놓친 5개: 수 낱말만 쓴 "열두와 열여덟의 최소공배수", "민수가 철수보다 빠르다는 말이 맞아?", "0.75를 분수로", "이백사십 킬로그램은 몇 톤", "연속된 세 자연수의 합이 78"(T237).

| 검사 | 결과 |
| --- | --- |
| `test/reasoning.test.js` 6개 (기존 3, dev·dev2 전부, holdout 바닥값 55/60·오판 0) | 통과 |
| T226 규칙으로 바꿔 돌리기 | 2개 실패 → 잡음, 원상 복구 |
| `npm test` | 206개 통과 |

한계: 이번에는 실제 모델로 답 정확도를 다시 재지 않았다(T226 때 이 모델은 새로 잡힌 문제도 빠른 답으로 맞혔다). 새로 잡는 계산 질문은 답이 약 10초 늦어진다(사용자가 받아들임).

### 2026-11-14 문서 일관성 2차 점검과 정비 (speckit-analyze, 코드 변경 없음)

점검: 헌법·spec·plan·tasks·research·data-model·quickstart 대조. 요구사항 23개(FR 16·SC 7) 모두 작업 연결(100%). 매우 중요 1·높음 5·중간 6·낮음 3건.
사용자 "응, 고쳐"로 아래를 고쳤다.

| ID | 고친 곳 | 내용 |
| --- | --- | --- |
| C1 | constitution.md 0.3.0 → 0.4.0 | "기기 없는 기본 기능만" → 사용자가 승인한 범위(로컬 음성 입출력·받아쓰기·회의 녹음·캐릭터·화면) 포함, 받은 승인은 날짜와 함께 기록. 원칙 I~V는 그대로 |
| H1·H2·M2 | spec.md FR-001·FR-008·단계 구분 | 마이크 입력·받아쓰기·회의 녹음 구현됨(가짜 마이크로만 확인)으로 고침 |
| H3 | spec.md US1 | "Mac 실제 마이크로 검사"·"1단계 제외" → Mac·Windows 각각, 기기 없는 부분 구현 |
| M6·L1 | spec.md 주요 개체·머리 | VoiceSession 보류 문구를 실제 구조로, 고친 날짜 11-14 |
| H4·H5·M1 | plan.md | 헌법 점검 II 다시 평가(일부 통과), whisper.cpp·ffmpeg 실행 도구와 근거, 단계·구조에 새 파일 |
| M3 | research.md | STT 결정(whisper.cpp)과 마이크는 ffmpeg 대신 브라우저 녹음으로 바꾼 이유 |
| M5 | data-model.md | 설정 키 chat.fast·chat.autoThink, 회의 원음 파일 규칙 |
| L2 | quickstart.md | 받아쓰기·마이크·옛 DB 정리 확인 방법 |
| M4 | tasks.md | T138·T205 체크(남은 Mac 확인은 T137·T146·T213), 막힌 일 목록 갱신 |

하지 않은 것: L3(Phase 19 번호 순서 정리)는 읽기 편의라 그대로 둠.

### 2026-11-14 Windows 남은 기능 묶음 (Phase 20, T240~T252, 실제 마이크·스피커·유료 API·외부 전송 없음)

기준: 시작 때 `npm test` 206개 통과(사용자도 독립 확인).

**T237/T241 계산 판단 4차 보완** — 학습: dev·dev2·dev3(T236 평가 묶음) + 내가 만든 예시(계산 9·일상 함정 12). 평가: 다른 에이전트가 먼저 만든 넷째 묶음(계산 60·일상 60)을 규칙 고정 뒤 한 번만 열었다. 모델 호출 없음.

| 넷째 묶음(처음 본 문제) | 처음 규칙 | T236 규칙 | 새 규칙 |
| --- | --- | --- | --- |
| 계산 60개 중 잡은 수 | 14 | 27 | **44** |
| 일상 60개 중 잘못 잡은 수 | 0 | 1 | **1** |

오판 1: "아이폰 열다섯 프로 무게가 몇 그램이야?"("프로"를 퍼센트로 읽음, T236 규칙도 같음). 놓친 16개는 대부분 세는 말 없는 한자어 수("칠십일은", "오 톤은")와 톤·인치·피트·갤런·온스·밀리그램 단위, "몇 분의 몇"(T253).
바꾼 것: 맞는지 따지기("…맞아?", 순서 퍼즐·수가 둘 이상), 분수·소수·퍼센트로 바꾸기, 최대공약수·최소공배수, 소수·약수 묻기, 연속한 수, 합, 말로 쓴 셈("십 더하기 오"), "삼분의 일"·"영 점 칠오", "열두와"처럼 이음말 앞 수, 단위 톤·평·제곱·갤런·야드.

**T242/T243 회의록 검색** — `MeetingStore.search`(제목·녹취, LIKE ESCAPE로 `%`·`_`·`\` 글자 그대로, 100자 이하, 200구간에서 자름), `GET /api/meetings/search?q=`, 회의 탭 검색(시간 구간 표시·누르면 그 위치 재생). 검사 6개: 시간 구간·대소문자, 특수문자(% _ \ 따옴표 이모지 SQL 같은 글), 잘못된 검색어, 녹취·회의 삭제 뒤, 자르기, API(인코딩·토큰·빈 값). 변이(이스케이프 끔) → 2개 실패.

**T244/T245 검색 빠른 작업** — `memory-search`·`meeting-search`(kind `local.memory.search`·`local.meeting.search`). 미리 보기에 검색어·대상·영향(찾는 자료 수, 외부 전송 없음, 번호만 저장). 결과는 기억 번호 / 회의·구간 번호·시간만 저장, 화면은 볼 때 지금 자료로 풀어 보이고 지운 것은 "(지워진 …)". 기본 빠른 작업 목록(`defaultQuickActions`)은 그대로 두고 화면·CLI에서 더함(기존 계약 유지). 검사 8개: 목록·미리 보기·승인 전 결과 없음, 동시 3회 실행에 1번, 거절·취소·내용 변경, 잘못된 검색어(빈 값·101자·숫자·비밀 형태), 바뀐 내용 실행 실패, 특수문자, 지운 뒤 DB·WAL 파일에 원문 없음, CLI. 변이(결과에 원문 넣기) → 3개 실패.
자료 잔류 검토: 검색어는 승인한 미션 내용(제목·content)에 남는다(명세 FR-007a). 찾은 원문은 미션에 남지 않는다.

**T246/T247 회의 조각 중복(독립 QA 재현 결함)** — 재현: 첫 /chunk 응답만 끊고(서버는 처리) 같은 조각을 다시 보내면 원음이 두 번 붙음(검사로 재현: 재전송 응답에 duplicate 없음, 고치기 전 길이 3000ms). 수정: `?seq=N` 조각 번호 + 내용 sha256. 같은 번호·같은 내용 → 다시 붙이거나 받아 적지 않고 처음 결과(duplicate:true), 같은 번호 다른 내용·건너뛴 번호 → 409, 잘못된 번호 → 400, 번호 없는 옛 호출은 예전처럼 붙임(섞어 쓰기는 409). 번호 기록은 메모리에만(JARVIS 재시작 시 녹음 중 회의는 interrupted라 더 못 붙임). 화면은 재시도 때 같은 번호를 보냄. 검사 4개 추가(응답 유실 재전송, 번호 규칙·옛 호출, 재시작, 동시 같은 조각).
화면 확인: 첫 조각 응답을 화면 안에서 끊자 seq=0이 두 번 갔고, 원음 6.5초·구간 3개로 중복 없음.

**T248 회의 삭제 뒤 원음 정리(독립 QA 지적)** — 지우면 재생 멈춤·src 제거·blob URL 해제·캐시 비움, 캐시 열쇠를 회의 번호+수정 시각으로 바꿔 바뀐 원음은 다시 받음, 보이던 검색 결과도 다시 찾음. 화면 확인: 정리를 끈 상태로 지우면 지운 회의 원음이 화면에 남는 것을 재현 → 고친 상태에서는 src 없음·캐시 비움·재생기 숨김, 다른 회의는 새로 받아 재생. blob URL을 직접 열어 보는 확인은 화면 CSP(connect-src)로 원래 막혀 증거로 쓰지 않았다.

**T249~T251 캐릭터 얼굴(T155 잠정안)** — `public/avatar.js`(모양 동그라미·둥근 네모·물방울, 색 #RRGGBB, 눈 동그란·선·점, 상태 대기·듣기·생각·말하기, 말하기 때 150ms 박자로 입 열고 닫기, 움직임 줄이기면 반쯤 연 채 멈춤). 음소 립싱크 아님. `characters.look` 열(옛 DB는 열을 더하고 기본 얼굴). 캐릭터 탭: 만들기·수정에 얼굴 고르기와 상태별 미리 보기, 수정 취소, 카드에 작은 얼굴. 대화 탭: 적용 캐릭터 얼굴. 검사 7개(상태 판단·입 박자·그리기와 이상한 값 막기·저장 검사·옛 DB·API 적용과 재시작 복원·말하기→멈추기/재생 끝→대기).
독립 QA 결함: 소리 읽기를 끈 채 답을 기다릴 때 얼굴은 "생각 중", 상태 글은 "대기". 상태 글도 얼굴과 같은 판단(녹음 중 > 말하기 > 답 기다림·생성 > 듣기 > 대기)을 쓰고 둘을 한 함수로 함께 그리게 고침. 고치는 중 글이 먼저 바뀌고 얼굴이 0.12초 늦는 어긋남 3번을 보고 같이 고침. 화면 확인(20ms마다 읽기): 소리 끔 생성→완료 51번, 소리 켬 생성→말하기→멈추기 67번, 생성→말하기→재생 끝 294번, 녹음 중 96번 모두 어긋남 0.
이 브라우저 창은 "움직임 줄이기"가 켜져 있어 화면에서는 입이 반쯤 연 채였다(명세대로). 박자로 열고 닫는 것은 모듈 검사로만 확인.

**T252 전체** — 상태 글 수정 뒤 `npm test` 3회 모두 233개 통과(시작 206개 → 새 검사 27개).

한계·미검증: 실제 마이크·스피커(T218·T231·T235), 사람 목소리, Mac(T137), 캐릭터 원본 대조(T155), 실제 청취(T148·T156), 넷째 묶음에서 놓친 계산 유형(T253). 화면 확인은 임시 실행기(가짜 받아쓰기·소리 없는 가짜 스피커·모의 공급자)로만 했다.

### 2026-11-14 계산 판단 5차 보완 (T253, Windows, 모델 호출·외부 전송 없음)

주의: 판단기는 단순 규칙(휴리스틱)이다. 아래 수치는 이 문제 묶음에 대한 한계 자료이고, 실제 답 정확도가 좋아졌다는 뜻이 아니다(이번에는 모델로 재지 않았다).

순서: ① 다섯째 평가 묶음을 다른 에이전트가 먼저 만듦(계산 60·일상 60, 09:01 sha256 앞 4a62d0b6760e5dd5) → ② 넷째 묶음(T237 평가)을 학습 자료 dev4로 바꾸고 검사부터 씀(그때 규칙으로 실패 확인) → ③ 규칙 보완 → ④ 고정 뒤 다섯째 묶음을 한 번만 엶(해시 그대로 확인).

바꾼 것(T253에 적은 유형만): 세는 말 없는 한자어 수("칠십일은", 십·백·천·만이 든 것만), "백 이하" 같은 범위, 다섯~아홉만 쓴 고유어 수, "열일곱은"처럼 조사 앞 수, 단위 이름(톤·인치·피트·갤런·온스·밀리그램·마일·야드·평·파운드·주), "몇 분의 몇", "소수로 말해 줘", "…소수 맞지"·"소수라는 말", 단위 둘을 비교해 맞는지 따지기, "며칠까지", 대각선, "반 킬로그램".
오판 고침: 퍼센트 계산은 퍼센트·금액·오르내림을 물을 때만, 단위 바꾸기는 수 바로 뒤에 단위가 붙고 같은 종류(길이·무게·부피·넓이)끼리일 때만("아이폰 열다섯 프로 무게 몇 그램", "맥북 프로 십육 인치 무게 몇 그램"은 빠른 답).

| 다섯째 묶음(처음 본 문제) | 처음 규칙 | T236 | T237 | T253 |
| --- | --- | --- | --- | --- |
| 계산 60개 중 잡은 수 | 17 | 32 | 43 | **56** |
| 일상 60개 중 잘못 잡은 수 | 0 | 1 | 1 | **1** |

- T237 규칙의 오판은 "아이폰 열일곱 프로 무게가 몇 그램이야?"(이번에 고쳐짐), T253 규칙의 오판은 "맥북 프로 십육 인치 가격 얼마야?"(제품 "프로"·"십육 인치"·"얼마"를 퍼센트 계산으로 읽음).
- 놓친 4개: "구백구십구는 삼으로 나누어떨어져?", "이천사십팔은 팔로 나누어떨어지나?", "월요일부터 금요일까지 매일 사십 분씩 걸으면 일주일에 몇 분이야?", "삼 주 하고 나흘은 며칠이야?". 범위를 넓히지 않으려고 이번에는 고치지 않았다(T254, 선택).

| 검사 | 결과 |
| --- | --- |
| `test/reasoning.test.js` 10개 (기존 계산·일상 회귀, dev~dev4 전부, T237·T253 학습 예시, holdout 바닥값 56/60·알려진 오판 1개) | 통과 |
| T237 규칙으로 바꿔 돌리기 | 3개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 235개 통과 |

사용자 결정(2026-11-14): 여기서 멈춤. T254(계산 판단 6차)와 L3(tasks 번호 정리)는 선택 사항으로 남김. 재개는 원본·마이크·Mac·키·인증·청취 중 준비된 것부터.

### 2026-11-14 재개: 계산 판단 6차 보완 (T254, Windows, 모델 호출·외부 전송 없음)

재개: 사용자 요청("남은 계산 판단 오류도 계속 고치고 전체 테스트까지")으로 앞선 "여기서 멈춤"을 해제했다. 범위는 계산 판단 코드·검사·문서만.
주의: 판단기는 단순 규칙(휴리스틱)이다. 아래 수치는 판단 분류 결과이고 실제 모델 답 정확도가 아니다(이번에는 모델을 부르지 않았다).

순서: ① 여섯째 평가 묶음을 다른 에이전트가 먼저 만듦(계산 60·일상 60, 09:21, sha256 앞 67418444e6c650cb) → ② 다섯째 묶음을 학습 자료 dev5로 바꾸고, 놓침 4개·오판 1개와 변형·일상 함정 검사를 먼저 씀 → 그때 규칙으로 2개 검사 실패(놓침 4개, 변형 9개) 확인 → ③ 규칙 보완 → ④ 고정 뒤 여섯째 묶음을 한 번만 엶(해시 그대로).

바꾼 것(특정 문장 예외 없이 일반 규칙):
- 나누어떨어짐: "나누어떨어/나눠떨어/나머지 없이 나눠" + 수. "케이크 나눠 먹을", "반으로 나눠서"는 아님.
- 범위에서 반복: "씩" + (매일·마다·매주·하루에·요일부터/까지·N 동안) + 합계 질문(몇 분·얼마·모두 등) + 수.
- 한글 기간 합산·바꾸기: 기간 낱말(N 주·일·시간·분, 하루~열흘·보름)이 둘 이상이고 며칠·몇 시간을 묻거나, 하나라도 "며칠 몇 시간"처럼 섞어 물을 때. "이 일 며칠 걸려?", "사흘 뒤에 알려 줘"는 아님.
- 퍼센트의 "프로": 수 바로 뒤의 "프로"이고, 그 수 앞이 제품 이름(아이폰·갤럭시·맥북·에어팟·탭 등, 영문 낱말)이 아니며, 뒤에 맥스·인치·가격 같은 제품 말이 없을 때만. 할인 질문에 "깎"을 더함.

| 여섯째 묶음(처음 본 문제) | 처음 규칙 | T237 | T253 | T254 |
| --- | --- | --- | --- | --- |
| 계산 60개 중 잡은 수 | 22 | 39 | 47 | **57** |
| 일상 60개 중 잘못 잡은 수 | 0 | 2 | 2 | **0** |

- T253 규칙의 오판 2개("갤럭시 탭 에스 구 프로 가격 얼마야", "에어팟 프로 이 세대 배터리 얼마나 가?")는 T254에서 빠른 답이 됐다.
- 놓친 3개: "보름 하고 닷새면 며칠이야?"("면" 앞의 기간 낱말을 세지 못함), "삼 주는 몇 시간이야?"(기간 하나를 다른 단위로 바꾸기), "섭씨 삼십칠 도는 화씨로 몇 도야?"(온도 바꾸기). 이 묶음을 본 뒤라 고치지 않았다(T255, 선택).
- 한계: 묶음 하나(120문장)와 직접 만든 예시 기준이다. 실제 사용자 말·다른 표현에서는 더 놓치거나 잘못 잡을 수 있다.

| 검사 | 결과 |
| --- | --- |
| `test/reasoning.test.js` 12개 (기존 계산·일상 회귀, dev~dev5 전부, T237·T253·T254 학습 예시, holdout 바닥값 57/60·오판 0) | 통과 |
| T253 규칙으로 바꿔 돌리기 | 3개 실패 → 잡음, 원상 복구 |
| 직접 만든 추가 함정 12개·변형 계산 5개 | 함정 0개 오판, 변형 0개 놓침 |
| `npm test` 3회 | 매회 237개 통과 |

### 2026-11-14 T254 보강: 독립 검증 변형 (T256, Windows, 모델 호출 없음)

독립 검증(사용자)에서 13문장 중 2개가 빠른 답으로 남음: "화요일에서 토요일까지 매일 이십 분 걸으면 총 몇 분이야?", "두 주랑 사흘을 합치면 며칠?".
재현: 변형 8개·일상 함정 6개 검사를 먼저 씀 → 보강 전 규칙으로 변형 4개 놓침(위 2개 + "월요일부터 목요일까지 매일 삼십 분…", "수요일에서 일요일까지 하루에 만 원…") 확인.
보강(T254 범위 안): 범위에 "요일에서" 추가, "씩"이 없어도 반복(매일·하루에·마다)과 범위(…요일부터/에서 …요일까지, N 동안)가 함께 있고 합계를 물으면 생각함. 기간 낱말 뒤에 "랑·면·만"이 와도 셈.

| 검사 | 결과 |
| --- | --- |
| 변형 8개·함정 6개(새 검사) | 보강 전 4개 실패 → 보강 뒤 통과 |
| 추가로 직접 만든 일상 함정 10개("방학 동안 매일 할 일 목록", "한 달 동안 매일 운동하면 효과 있어?" 등) | 오판 0 |
| 보강 전 T254 규칙으로 바꿔 돌리기 | 1개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 238개 통과 |

여섯째 묶음: 미공개 평가 결과는 위 T254 기록(계산 57/60, 오판 0/60) 그대로 둔다. 보강 뒤 같은 묶음은 이미 본 묶음이라 미공개 평가가 아니며, 참고값은 계산 58/60·오판 0/60("보름 하고 닷새면"이 "면" 보강으로 잡힘). 남은 2개는 T255(선택).
판단 분류 결과이며 실제 모델 답 정확도가 아니다.

### 2026-11-14 계산 판단 T255: 남은 확인된 오류 3개 고침 (Windows, 모델 호출 없음)

요청: 남은 계산 판단 오류를 계속 고침. 여섯째 묶음을 이미 본 것은 평가 해석의 제한일 뿐 오류를 고치지 못할 이유가 아니므로 고친다. 새 미공개 평가는 만들지 않았다.
판단 분류 결과이며 실제 모델 답 정확도가 아니다.

재현: 여섯째 묶음을 회귀 검사 dev6(계산·일상 전부 맞혀야 함, 허용값 없음)으로 바꾸고 T255 검사(계산 변형 14·일상 함정 12)를 먼저 씀 → 그때 규칙으로 dev6 2개("삼 주는 몇 시간이야?", "섭씨 삼십칠 도는 화씨로 몇 도야?")와 변형 11개 실패 확인. ("보름 하고 닷새면"은 T256의 "면" 보강으로 이미 통과.)

고친 것(일반 규칙):
- 단일 기간 바꾸기: 주제로 쓰인 기간("삼 주는", "이틀은", "백이십 분은", "나흘이면")의 단위와 묻는 단위(며칠·몇 시간·몇 분 등)가 다를 때. 같은 단위("이 일 며칠 걸려?"), "몇 시에"(시각), 활동 기간("한 달 동안 며칠 쉬었는지")은 아님.
- 온도 바꾸기: 섭씨(도씨·℃)와 화씨(℉)가 둘 다 나오고 수가 있을 때. "오늘 섭씨 몇 도야?", "에어컨 섭씨 이십육 도로 맞춰 줘", "섭씨 화씨 변환 앱 추천해 줘"는 아님.
- 한자어 수 뒤 조사에 "면"을 더함("화씨 팔십육 도면").
- 고치는 중 직접 만든 함정에서 오판 1개("한 달 동안 며칠 쉬었는지 기록 보여 줘")를 찾아, 기간을 주제로 쓴 경우만 세도록 좁혀 고침(검사에 추가).

결과:
- 여섯째 묶음 수정 전 미공개 평가 기록(T254 때): 계산 57/60, 일상 오판 0/60 — 그대로 둔다.
- 수정 뒤 같은 묶음 재검사(이미 본 묶음, 미공개 평가 아님): 계산 60/60, 일상 오판 0/60.

| 검사 | 결과 |
| --- | --- |
| `test/reasoning.test.js` 14개 (기존 계산·일상 회귀, dev~dev6 전부, T237·T253·T254·T254 보강·T255 예시) | 통과 |
| T256 규칙으로 바꿔 돌리기 | 2개 실패 → 잡음, 원상 복구 |
| `npm test` 3회 | 매회 239개 통과 |

한계: 지금은 미공개 평가 묶음이 없어 처음 보는 문장에서의 성능은 이번에 재지 않았다. 규칙이 늘어 판단이 복잡해졌고, 실제 사용자 말에서는 더 놓치거나 잘못 잡을 수 있다.

### 2026-11-14 Windows 실제 실행 QA (Phase 21, T257~T265, 실제 마이크·스피커 소리·유료 API·외부 전송 없음)

환경: Windows 11, Node 24.19.0, 실제 `src/main.js`, 포트 47989, 시험 데이터 `work/qa-real-20261114`(사용자 `data/`·`.env.local` 안 씀).
환경 변수: JARVIS_NO_ENV_FILE=1, JARVIS_ALLOW_REMOTE=0, JARVIS_OLLAMA_BASE_URL=http://127.0.0.1:11434, JARVIS_OLLAMA_MODEL=gemma4:12b(이미 설치된 모델, 새 다운로드 없음). 받아쓰기는 프로젝트 tools/whisper(이미 있음).
이 시험 DB는 사용자의 독립 QA와 함께 썼다(사용자 회의 2개·캐릭터 "독립검증 도우미" 있음, 끝에 그 캐릭터를 다시 적용해 둠).

실제 엔진(가짜 아님)으로 확인한 것:
| 흐름 | 결과 |
| --- | --- |
| 한국어 글 대화(Ollama) | 두 문장 답 정상 |
| 기억 포함 대화(로컬) | "아침에 따뜻한 보리차" 기억으로 답함 |
| 외부 공급자 + 기억 | 바로 안 보내고 승인 대기 #1(보낼 메시지 미리 보기) → 거절 |
| 외부 공급자 + 기억 없음 | "외부 전송 승인 전이라 외부 주소로 보내지 않음" 안내, 네트워크 안 씀 |
| 빈 질문 | "질문이 비어 있음" |
| 멈추기 → 다시 묻기 | 긴 답을 멈추면 답 버림 표시, 다음 질문 "서울" 정상 |
| 캐릭터 적용 뒤 말투 | "냥냥, 오늘은 따끈한 국밥을 추천해." |
| 얼굴·상태 글 일치 | 대화 중 160회 표본, 어긋남 0 |
| 캐릭터 만들기·미리 보기 | 모양·색·눈 반영, 상태 미리 보기 3가지 모습. 이 브라우저는 움직임 줄이기 켜짐이라 말하기 입은 반쯤 연 채(설계대로) |
| 수정 취소/저장, 재시작 복원 | 취소는 그대로, 저장은 반영, 재시작 뒤 적용 캐릭터·얼굴 유지, 중단 복구 0 |
| 회의 파일 가져오기(실제 whisper) | 화면 입력으로 합성 음성(Heami, 파일만, 재생 없음) ogg 24KB → 구간 2개, 510ms. "시안"을 "시한"으로 잘못 받아 적음(인식 한계) |
| 회의록 검색 | "예산" 회의 2개·구간 2개, "%"·"_"·따옴표·역슬래시 0건(와일드카드 안 됨), 빈 칸 400, 300자 400 |
| 시간 위치 | 무음(muted)으로 00:58 버튼 → 재생 위치 58초부터, 바로 멈춤 |
| 빠른 작업 회의록 검색 | 요청 2개 승인 대기(결과 없음) → 1개 거절, 1개 승인·실행 → 결과는 회의·구간 번호와 시간만 저장, 다시 실행은 거절 |
| 회의 삭제 | 확인 문구 표시, 재생 사본 지움(src 없음·숨김), 원음 파일 지움, 원음·구간 API 404, 보이던 검색 결과 갱신, 삭제 회의만의 말 검색 0건, 빠른 작업 결과는 "(지워진 회의 #3)" |
| 실행 경로·포트 | 다른 폴더에서 실행 + 공백·한글 데이터 경로 정상, 잘못된 Host 421, 같은 포트 두 번째 실행은 "포트 47989이(가) 이미 사용 중" 종료 코드 1 |

찾아서 고친 오류(재현 → 검사 → 최소 수정 → 재검사):
1. 화면 연결이 끊겨도 답 생성 계속(T258). 실제 재현: 긴 답 요청을 버린 뒤 짧은 질문이 88초 걸림(평소 1~2초). 고친 뒤 실제 재검사 0.3초. 독립 QA가 소리 읽기 켠 경로도 같은 결함을 재현(providerAbortedOnDisconnect=false) → 차례별로 연결해 고침. 옛 요청의 연결 끊김은 새 차례를 끊지 않음(검사). 소리 읽기 켠 경로는 실제 소리를 내지 않으려고 가짜 스피커로만 확인.
2. 끄기 멈춤(T259·T260, 독립 QA 재현 waitingBeforeCancel=true). 실제 CLI 재현: Ollama 답 생성 중 끄기 신호 → 12초 뒤에도 안 꺼지고 whisper-server 자식 남음(정리 스크립트가 강제 종료). 고친 뒤: 0.76~0.85초에 꺼짐, 대화 요청은 200 interrupted 응답을 받음, whisper 자식 없음, DB integrity_check ok. 옛 순서로 바꿔 돌리면 다시 멈춤(검사·CLI 모두) → 원상 복구.
   - 확인한 것: Ctrl+Break(SIGBREAK)를 그 JARVIS 콘솔에만 보내 같은 끄기 함수가 도는 것(위 결과).
   - 확인 못 한 것: Ctrl+C 전달. 이 자동 실행 환경에서는 Ctrl+C 신호가 자식 콘솔에 닿지 않았다(물려받은 무시 설정, 작은 확인 프로그램으로 확인). 실제 콘솔 창의 Ctrl+C와 창 닫기(SIGHUP)는 사람이 직접 확인해야 한다.
3. 느린 응답 사이 탭 빠른 전환 때 공급자 선택지 5→10개 중복(T261, 독립 QA 재현). 실제 화면 재현(내 지연 프록시, /api/providers만 1.5초) → 고친 뒤 5개, 기다리는 사이 바꾼 공급자(mock)·고른 기억·끈 빠른 답이 그대로 유지. 캐릭터 탭도 같은 유형이라 최신 응답만 반영.
4. 실제 whisper가 마침표만 따로 구간으로 내 회의록에 "00:08 ." 표시(T264) → 앞 구간에 붙임. 실제 whisper 재검사: 구간 1개 "…김 팀장입니다."

검사:
| 검사 | 결과 |
| --- | --- |
| test/text-stop.test.js(연결 끊김 글·소리 읽기 켬), test/turns.test.js(차례별 끊김) | 통과. 옛 차례 규칙 사본으로 돌리면 2개 실패 |
| test/shutdown.test.js 5개(생성·취소 무시 공급자·미리 듣기·빈 상태·실행 중 전송 미션) | 통과. 옛 순서면 멈춤 |
| test/chat-tab-race.test.js 3개 | 통과. 검사마다 제한 시간 2초, 가짜 API는 호출별(비동기 문맥)로 응답해 옛 코드의 뒤따르는 요청도 풀어 줌 |
| 옛 loadChat 변이 검사(임시 복사본에서만, 제한 시간 30초, 끝나면 복사본 삭제) | 2개 실패로 빨리 끝남(무한 대기 없음). 프로젝트 index.html 해시 그대로(34d1e7293c159d0e…) |

변이 검사 기록 정정: 처음 변이 검사는 프로젝트 index.html을 직접 바꿔 돌렸고, 옛 코드에서 검사가 끝나지 않아(가짜 API가 그 순간 대기 중인 요청만 풀어 줌) 사용자가 중단했다. 이것은 검사 도구 결함이며 정상적인 실패 결과가 아니다. 중단 직후 index.html이 옛 loadChat 상태로 남은 것을 확인하고 고친 백업으로 되돌렸다(고친 표시 1개·옛 표시 0개·백업과 같음 확인). 그 뒤 검사를 고치고 위처럼 복사본에서만 다시 돌렸다.
| test/meeting-import.test.js(문장부호 구간) | 고치기 전 실패, 고친 뒤 통과 |
| `npm test` | 252개 모두 통과 |

미검증·제한:
- 실제 마이크·사람 목소리·실제 스피커 청취: 이번에도 안 함(이 PC에 마이크 없음, 소리 금지).
- 소리 읽기 켠 대화의 연결 끊김은 가짜 스피커로만 확인(실제 OS 음성은 소리가 나므로).
- 실제 콘솔 창 Ctrl+C·창 닫기는 사람이 확인해야 함(자동 실행에서는 Ctrl+Break로 대신).
- 회의 가져오기·받아쓰기는 화면이 연결을 끊어도 끝까지 처리한다(올린 파일은 저장함). 설계 유지.
- 끄기 때 ffmpeg 변환 중 자식은 따로 끊지 않는다(60초 제한 있음).
- 같은 포트로 두 번째 실행이 실패해도 지정한 데이터 폴더에 빈 DB가 먼저 만들어진다(제안만, 안 고침).
- 최종 확인용 서버: http://127.0.0.1:47989/ (시험 데이터 `work/qa-real-20261114`, 실행 상태로 둠).

사용자 독립 확인(사용자 보고, 내 검사 결과 아님): 실제 서버 47989 새로 고침 뒤 Ollama + 기억 선택 질문 성공, 캐릭터 "QA 고양이" 말투·기억 반영("냥냥, 아침에 따뜻한 보리차를 마시는구나."), 실제 whisper 67.763초 합성 파일 가져오기 구간 8개, "예산" 검색 00:58 확인. 사용자 지연 프록시(54568)로 공급자 중복 해소 재확인 후 그 프록시는 사용자가 종료.

### 2026-11-14 반복 QA (T266·T267, Windows, 실제 마이크·스피커 소리·외부 전송·새 다운로드 없음)

환경: 실제 `src/main.js`(포트 47989, 시험 데이터 `work/qa-real-20261114`), JARVIS_NO_ENV_FILE=1, JARVIS_ALLOW_REMOTE=0, Ollama 127.0.0.1:11434 gemma4:12b, 소리 읽기 꺼짐.
시험 캐릭터는 접두어 "QA2-"(QA2-A 에이·QA2-B 비이)로 만들고 끝에 지웠다. 사용자 자료(회의·캐릭터)는 지우지 않았다.
시작 상태(적용 캐릭터 #1 "독립검증 도우미", 빠른 답 켬, 자동 생각 켬, 소리 읽기 꺼짐)를 끝에 그대로 복원해 확인했다.
"실제 앱"은 실제 서버·실제 Ollama·실제 화면 코드다. 화면 반복은 화면 단추·입력을 스크립트로 눌렀다(사람 손 클릭 아님). "가짜"는 node:test 검사다.

| 흐름 | 방식 | 시도 | 성공 | 비고 |
| --- | --- | --- | --- | --- |
| 답 멈추기 → 다시 묻기 | 실제 서버 API | 12 | 12 | 멈춤 0.8~2.0초 뒤, 끊긴 답은 버림, 다시 묻기(나라 수도) 0.27~0.34초, 답 맞음 |
| 답 멈추기 → 다시 묻기 | 실제 화면 단추 | 10 | 10 | "(중간에 멈춰서…)" 표시, 다시 묻기 0.22~0.34초, 답 맞음 |
| 캐릭터 A↔B 전환(생성 중 0.3~0.7초에 전환, 직후 다시 질문) | 실제 서버 API | 10 | 10 | 상태는 바로 새 캐릭터, 진행 중 답은 질문 때 캐릭터 말투, 다음 답은 새 캐릭터 말투 |
| 캐릭터 전환 + 탭 이동(대화 중 캐릭터 탭에서 적용 → 대화 탭) | 응답 순서 뒤집기 프록시 | 15 | 15 | 얼굴·상태 글이 옛→새 한 번만 바뀌고 되돌아가지 않음 |
| 같은 흐름 | 실제 서버 | 10 | 10 | 같음 |
| 회의록 검색 빠른 전환("예산" 뒤 다른 검색어) | 프록시("예산"만 1.2초 늦춤) | 10 | 고치기 전 0 / 고친 뒤 10 | 결함 재현 → T267 |
| 같은 흐름 | 실제 서버 | 10 | 10 | 로컬 응답이 빨라 고치기 전에도 재현 안 됨 |
| 검색 + 캐릭터 변경 + 탭 전환 겹침 | 프록시 | 10 | 10 | 검색 결과·적용 캐릭터 모두 맞음, 오류 알림 0 |
| 같은 흐름 | 실제 서버 | 10 | 10 | 같음 |

찾아서 고친 결함(T267): 회의록 검색에 "가장 마지막 요청만 반영"이 없어, 늦게 온 옛 검색 결과가 나중에 친 검색어의 결과를 덮었다(입력 칸은 "월요일"인데 "예산" 결과가 보임).
재현 → 검사 먼저(test/meeting-search-race.test.js 3개, 고치기 전 2개 실패) → searchMeetings에 최신 검사 2줄 → 검사 통과 → 프록시 실제 화면 0/10 → 10/10.
변이 검사: 임시 복사본에서만 고친 줄을 빼고 30초 제한으로 돌림 → 2개 실패로 끝남, 복사본 삭제, 프로젝트 index.html 해시 그대로.

결함 아님으로 판단해 고치지 않은 것(기록):
- 처음 멈추기 반복에서 4/10은 긴 답이 1.3초에 스스로 끝남: 적용 캐릭터 "독립검증 도우미" 말투가 "한 문장으로 짧게"라서. 이 흐름은 캐릭터 적용을 해제하고 다시 돌림(위 12/12).
- 같은 첫 반복에서 다시 묻기("N 더하기 1은?")가 30초 제한을 넘김: 멈추기 결함이 아니라 자동 생각으로 보내져 한 번에 35.8초 걸림(gemma4:12b, 단독 측정). 자동 생각 사용은 사용자 결정이라 바꾸지 않음. 느린 답의 한계로 남김.

검사: `npm test` 255개 모두 통과(work/repeat-qa-full-test.log).
한계: 사람 손 조작·실제 마이크·스피커·Mac은 아님. 소리 읽기 켠 상태의 전환·멈추기는 소리가 나서 실제로는 돌리지 않음(가짜 스피커 검사만). 실제 서버 반복은 이 PC의 빠른 로컬 응답 기준이다.

### 2026-11-14 독립 QA 재현 2건 처리 (T268·T269, Windows, 외부 전송·소리 없음)

1) 회의록 검색 경합(독립 QA: 실제 47989 앞 지연 프록시 62588, "예산"만 2.5초 늦춤 → "월요일" 결과를 늦은 "예산" 결과가 덮음, 빈칸도 되살아남)
- "최신 검색만 반영"은 T267에서 이미 들어가 있었다. 독립 QA 재현은 그 전에 연 화면이었을 수 있다(화면은 새로 열 때 새 index.html을 받음). 사용자 프록시 62588은 이 화면 창에서 열 수 없어(이동 거부) 같은 동작의 내 프록시(47992, "예산"만 2.5초)로 확인했고, 사용자 프록시는 끄지 않았다.
- 추가로 고친 것(T268): 늦게 실패한 옛 검색이 "할 수 없음" 알림을 띄우던 것 → 무시. 지금 검색이 실패하면 입력과 다른 옛 결과가 남던 것 → 결과를 지우고 "찾지 못함: …" 표시.
- 검사: test/meeting-search-race.test.js 6개(빈칸·오류 2개·삭제 뒤 다시 찾기 포함). 오류 2개는 고치기 전 실패 → 고친 뒤 통과. 삭제 경합은 T267 수정으로 이미 통과.
- 실제 화면(내 프록시 2.5초): "예산"→"월요일"·"예산"→빈칸 10/10, 늦게 실패하는 긴 검색어("예산"+100자)→"월요일" 3/3 알림 0, 지금 실패(101자) 3/3 "찾지 못함", 추가 "예산"→"월요일" 4/4. 삭제 뒤 다시 찾기 경합은 실제 화면에서 돌리지 않음(회의를 지워야 하고, 이 프록시는 두 검색을 똑같이 늦춰 순서가 안 바뀜) — 검사로만 확인.
- 변이 검사(임시 복사본만, 30초 제한, 복사본 삭제, 프로젝트 파일 해시 그대로): 최신 검사 줄을 빼면 2개 실패.

2) 시작 충돌로 진행 중 기록 훼손(독립 QA: work/startup-conflict-proof.mjs, 첫 서버의 "녹음 중" 회의가 두 번째 실행(포트 충돌, 종료 코드 1) 뒤 "중단"으로 바뀜)
- 원인: createServices가 DB를 열자마자 시작 복원(실행 중·녹음 중 → 중단)을 하고, 그 뒤에야 포트를 연다. 같은 데이터 폴더를 쓰는 다른 실행이 있는지 보지 않음. 다른 포트면 두 실행이 같은 DB를 함께 쓰게 됨.
- 재현: 사용자 proof 실행 → before recording, after interrupted, 두 번째 종료 코드 1.
- 고친 것(T269): 데이터 폴더에 잠금 파일(jarvis.lock, PID만 적음)을 DB 열기 전에 만든다(없을 때만 만드는 방식). 살아 있는 다른 실행의 잠금이면 "이 데이터 폴더를 다른 JARVIS(프로세스 N)가 쓰는 중" 안내 후 종료 코드 1, DB를 열지도 복원하지도 않음. 정상 종료(services.close) 때 지우고, 꺼진 프로세스가 남긴 잠금은 넘겨받는다.
- 검사: test/data-lock.test.js 3개(실제 main.js 자식: 같은 포트·다른 포트 모두 거부하고 첫 번째 녹음 그대로 / 정상 종료 뒤 시작·강제 종료 잠금 넘겨받기 / 내 것 아닌 잠금은 지우지 않음). 변이 검사(복사본에서 잠금을 빼면 녹음이 "중단"으로 바뀌어 실패, 복사본 삭제, 프로젝트 파일 그대로).
- 실제 재검사: 사용자 proof → before recording, after recording, 두 번째 종료 코드 1(잠금 안내). 새로 켠 47989 시험 서버에 같은 데이터로 같은 포트·다른 포트(47997) 두 번째 실행 → 둘 다 종료 코드 1, 미션·회의 상태 그대로, 잠금 PID 그대로. 실제 CLI Ctrl+Break 끄기 → 1.0초, 잠금 파일 지워짐, DB 정상.

검사: `npm test` 261개 모두 통과(work/lock-search-full-test.log).
한계:
- 잠금 파일이 남았는데 그 PID를 다른 프로그램이 다시 쓰는 드문 경우에는 실행을 거부한다(안내에 잠금 파일을 지우라고 적음).
- 꺼진 실행의 잠금을 두 실행이 동시에 넘겨받는 아주 짧은 경합은 막지 못할 수 있다.
- 이 수정 전 버전으로 켜 둔 JARVIS는 잠금을 만들지 않아 보호되지 않는다(그래서 47989 시험 서버를 새 코드로 다시 켰다).
- CLI(`npm run cli -- mission recover`, `db compact`)는 잠금을 보지 않는다(기존대로 JARVIS를 끈 뒤 쓰라는 안내 유지).

### 2026-11-14 독립 QA 후속 (T270·T271, Windows, 외부 전송·소리 없음)

시점 정정(사용자 보고): 앞서 받은 검색 덮어쓰기 재현은 T267 수정 전 화면이었다. 수정본을 새로 연 사용자 독립 재검사에서 2.5초 지연 "예산"→"월요일"·"예산"→빈칸 모두 정상, 실제 서버 순차 검색 10/10(work/repeat-direct-search.json). 사용자 프록시 62588은 사용자가 끈 것이며 제품 오류 아님.

1) 삭제 뒤 다시 찾기 구멍(T270)
- 원인: refreshMeetingSearch가 결과 상자가 비어 있으면(첫 검색 응답 대기 중) 다시 찾지 않아 새 검색 번호가 생기지 않음 → 늦게 온 옛 결과(지운 회의 포함)가 그대로 보임. 앞선 검사는 search를 직접 두 번 불러 이 조건을 거치지 않았다.
- 검사: 실제 refreshMeetingSearch를 거치는 검사 2개 추가(응답 전 삭제 → 다시 찾아 지운 회의 안 보임 / 검색한 적 없거나 검색어를 비웠으면 다시 찾지 않음). 고치기 전 1개 실패.
- 수정: 조건을 "검색어가 있고 검색을 한 번이라도 함(generation.meetSearch)"으로 바꿈.
- 변이 검사(임시 복사본만): 옛 조건이면 1개 실패, 복사본 삭제, 프로젝트 파일 그대로.
- 실제 화면(시험용 회의 "QA3-삭제 시험 1~5"를 실제 whisper로 만들고 화면에서 지움, 지연 프록시 "예산" 2.5초): 검색 직후(응답 전) 삭제 5회, 지운 회의가 결과에 다시 보인 적 0회(100ms 간격 관찰), 마지막 결과는 남은 회의만. 시험용 회의 5개는 모두 지움, 다른 회의는 건드리지 않음.
- 옛 실패 응답 경합은 앞 T268 실제 확인(3/3, 알림 0)과 검사로 확인.

2) 데이터 폴더 잠금 동시성 결함(T271, 사용자 재현: 빈 잠금 파일 틈에 두 번째가 SECOND_ACQUIRED_DURING_FIRST_INIT)
- 재현(내 스크립트, PID 파일 방식): 빈 잠금 파일을 붙잡아 두면 다른 실제 Node 프로세스가 잠금을 얻음(SECOND_ACQUIRED_DURING_FIRST_INIT). 실제 동시 시작 20회는 틈이 짧아 20/20 하나만 시작(그래도 결함은 실재).
- 수정: PID 파일을 버리고 OS 파일 잠금 사용. jarvis.lock.db를 node:sqlite로 열어 busy_timeout 0, BEGIN EXCLUSIVE를 프로세스가 사는 동안 쥠. 잡기는 한 번에 끝나고, 강제 종료되면 OS가 풂(남은 PID 판단·지우기 없음).
- 검사(test/data-lock.test.js 4개): 같은 포트·다른 포트 두 번째 실행 거부(녹음 그대로), 정상 종료 뒤 시작·강제 종료 뒤 잠금 풀림과 복원, 다른 실제 프로세스가 쥐는 동안 거부·그 프로세스 강제 종료 뒤 잡힘, main.js 두 개 동시 시작 5회 모두 하나만 시작.
- 변이 검사(임시 복사본만): BEGIN EXCLUSIVE를 BEGIN으로 바꾸면 4개 모두 실패, 복사본 삭제, 프로젝트 파일 그대로.
- 실제 재검사: main.js 두 개 동시 시작 30회 → 30회 모두 하나만 시작. 사용자 work/startup-conflict-proof.mjs → recording 그대로·두 번째 종료 코드 1. 사용자 work/startup-real-repeat-proof.mjs(실제 main 두 개) → 같은 포트·다른 포트 모두 종료 코드 1, 첫 회의 recording 그대로. 47989 시험 서버를 새 코드로 다시 켜 같은 데이터로 같은 포트·다른 포트 실행 → 모두 거부, 미션·회의·적용 캐릭터 그대로. 실제 CLI Ctrl+Break 끄기 0.84초, 끈 직후 잠금 바로 잡힘.
- 옛 PID 방식이 시험 데이터에 남긴 jarvis.lock(내 이전 실행의 것)은 지웠다.

검사: `npm test` 264개 모두 통과(work/oslock-full-test.log).
한계:
- 잠금 파일 jarvis.lock.db는 데이터 폴더에 남는다(빈 SQLite 파일, 쥐는 실행이 없으면 의미 없음).
- 네트워크 드라이브처럼 파일 잠금이 약한 곳은 확인하지 않았다. Mac(APFS)은 미검증.
- CLI 명령은 잠금을 보지 않는다(JARVIS를 끈 뒤 쓴다).
- 이 수정 전 버전으로 켠 JARVIS는 이 잠금을 쥐지 않는다.

### 2026-11-14 잠금 검사 자식 정리 (검사 코드만, 제품 코드 변경 없음)

사용자 독립 최종 확인(사용자 보고): OS 잠금 소스로 실제 main 8개 동시 시작 → 1개 실행·7개 차단, 실제 main 두 개 같은·다른 포트 검사도 recording 유지, 전체 264/264, 검사 중 src/test 해시 동일(work/repeat-qa-independent-final.log). 최종 서버 기억·캐릭터 대화도 사용자가 재확인.

고친 검사 결함(test/data-lock.test.js):
1. 확인(assert)이 실패하면 kill 전에 빠져나가 자식이 남았다(사용자: 변이 검사 중 부모 종료 뒤 자식 2개 남음 확인). → 자식을 띄우자마자 t.after로 끄기 등록, 파일 전체에서 띄운 자식을 모아 끝에 남김없이 끔(동시 시작 검사에서 한쪽이 시간 초과로 실패해도 다른 쪽을 끔).
2. 위 보강 뒤 검사가 멈춤(사용자가 그 실행만 중단): 신호로 끝난 자식은 exitCode가 null(signalCode만 있음)인데 kill이 exitCode만 보고 이미 지난 exit를 다시 기다림. → signalCode도 끝남으로 보고, 여러 번 불러도 같은 기다림을 돌려줌.
확인:
- test/data-lock.test.js 4개 통과, 1.6초에 끝남.
- 임시 복사본에서 잠금을 일부러 망가뜨려(BEGIN EXCLUSIVE → BEGIN) 4개 모두 실패시킴 → 0.9초에 끝남, 그 복사본을 가리키는 남은 node 프로세스 0개, 복사본 삭제, 프로젝트 파일 해시 그대로.
- `npm test` 264개 모두 통과(work/cleanup-final-full-test.log).

### 2026-11-14 동시 시작 모두 거부 결함 (T272, Windows, 외부 전송·소리 없음)

독립 QA 재현: `node --test --test-timeout=10000 test/data-lock.test.js`에서 동시 시작 검사 첫 회에 두 main이 모두 "이 데이터 폴더를 다른 JARVIS가 쓰는 중"으로 종료 코드 1(시작 0개). 사용자 독립 검사 work/startup-pair-repeat-qa.mjs(실제 main 두 개, 두 결과를 모두 받은 뒤 시작한 쪽을 끔) 수정 전 47/50(work/startup-pair-before.log).
원인: 잠금 기다림(busy_timeout)이 0이라, 새 잠금 파일에 동시에 들어온 실행들이 모두 공유 잠금을 쥔 채 서로 때문에 배타 잠금을 못 얻고 다 같이 바로 포기. 데이터 보호(둘 이상 동시 실행)는 깨지지 않았고, "아무도 시작 못 함"만 생김.
수정(최소): busy_timeout 0 → 2000. SQLite가 교착 쪽은 바로 물러나게 하고 남은 하나가 기다렸다 잡는다. 이미 쥔 실행이 있으면 새 실행은 최대 2초 기다린 뒤 거부한다(거부 안내가 약 2초 늦게 나옴).

유효한 결과(잡은 쪽이 모든 결과가 나올 때까지 쥐는 방식만 판정에 씀):
| 검사 | 수정 전(원본) | 수정 뒤 |
| --- | --- | --- |
| 사용자 독립 실제 main 두 개 50회 | 47/50(3회 둘 다 거부) | 사본 50/50, 실제 프로젝트 코드 50/50(사용자 실행, work/startup-pair-after.log) |
| 내 4프로세스 동시 잡기 50회(쥔 수 = 동시 보유 수) | 정확히 1개 48/50, 아무도 못 잡음 2/50, 2개 이상 0 | 사본 정확히 1개 50/50, 0개·2개 이상 0 |
| test/data-lock.test.js(새 4프로세스 10회 검사 포함 5개) | — | 5개 통과(`--test-timeout=10000`으로도 통과, 각 검사 자체 제한 시간 우선) |

판정에서 뺀 것:
- 처음 4프로세스 검사는 잡은 뒤 고정 시간(1.5/3초) 쥐고 놓는 방식이라, 먼저 쥔 쪽이 놓은 뒤 다른 실행이 잡는 정상 순차도 "여럿 잡음"으로 셌다. 이 결과(사본 50회 모두 "2개 이상")는 검사 방법 오류이므로 유효 판정에서 제외한다. 6초 고정 방식 재실행은 사용자가 중단(결과 없음).
- 수정 뒤 실제 프로젝트 코드로 내가 다시 돌리던 pair 50회·4프로세스 50회는 중복 검증이라 사용자가 중단. 그때 내 pair 실행이 work/startup-pair-after.log에 먼저 썼으나, 지금 들어 있는 내용(50/50)은 그 뒤(13:50:49)에 쓴 사용자 실행 결과다. 내 4프로세스 실행과 자식은 정리했고(남은 0개) 빈 결과 파일은 지웠다.
- 새 4프로세스 검사는 확률적 경합이라, busy 0으로 되돌린 코드에서 10회 안에 반드시 실패한다고 보장하지 못한다(이번에는 그 변이 실행을 하지 않음).

검사: `npm test` 265개 모두 통과(work/busy-final-full-test.log, 약 102초. 잠금 거부가 최대 2초 기다려 data-lock 검사가 길어짐).
한계: 네트워크 드라이브·Mac 잠금 미검증. 이 PC에서의 반복 결과이며 더 많은 동시 실행(5개 이상)은 실제 main으로는 사용자 8개 동시 확인(T271 때)만 있음.

### 2026-11-14 보안 연결(HTTPS) 옵션 (T276, Windows)

- 실행: `node src/main.js --port 47989 --host 192.168.0.53 --https --data <폴더>` → `https://192.168.0.53:47989/jarvis`.
- 실제 확인: 데이터 폴더 tls/에 인증서를 새로 만들고 지문(SHA-256) 출력. 그 인증서를 믿게 한 curl로 와이파이 주소·이 PC 주소 모두 200(이름·서명 검사 통과), 일반 http 요청은 연결 안 됨. 인증서 키는 데이터 폴더에만 있음(GitHub 제외).
- 이 PC 내장 브라우저는 자체 서명 인증서를 믿지 않아 열지 않음(경고를 넘기지 않음). 그래서 와이파이 주소에서 보안 연결로 인정되어 말하기·마이크·카메라가 열리는지는 휴대폰에서 사람이 경고를 확인하고 들어가 확인해야 함(T278).
- 주의: --https로 켜면 같은 포트의 http 주소는 더 이상 안 열림(휴대폰에서 http로 열면 안 열림 — https로 열어야 함).
- 검사: test/tls.test.js 3개(인증서 만들기·다시 쓰기·주소 바뀌면 새로 만들기, HTTPS 서버·자체 서명 거부·http 거부, openssl 없음 안내). `npm test` 270개 모두 통과.
- 사용자 확인(2026-11-14): 휴대폰에서 `https://192.168.0.53:47989/jarvis`가 인증서 경고 확인 뒤 열림. 말하기·마이크·카메라 실제 동작은 아직 확인 전(T278).

### 2026-11-14 치이카와 대화 모드·디자인 고도화 (T279~T282, Windows, 외부 전송·실제 소리 없음)

- 시험 서버(임시 데이터, 포트 47993, 클라우드 차단, Ollama 127.0.0.1:11434 gemma4:12b)에서 이 PC 내장 브라우저로 확인. 그림 얼굴은 코드로 만든 시험 그림(글자 "TEST idle" 등)만 씀.
- 자비스 모드(375×812): 질문 1회 → 생각 중 얼굴·입력 중 점 → 답 "시험, 만나서 반가워요." 말풍선·대화 칸 표시 → 대기. 오늘 대화 수 0→1. 브라우저 음성은 가짜로 바꿔 소리 없이 읽을 글만 받음(답 글과 같음). 가로 넘침 없음(375·1280).
- 설정 모드: #chat·#memory·#characters 주소로 그 탭이 열림, 빈 기억 안내와 "첫 기억 적기" 단추 보임, 가로 넘침 없음(375·1280). 캐릭터 지우기 확인 창이 열리고 처음 초점이 "취소", 제목·이름·되돌릴 수 없음 안내 확인, Esc로 닫으면 지우지 않음(캐릭터 1개 그대로).
- 검사: server·avatar-images·chat-tab-race·meeting-search-race 29개 통과. 전체 `npm test` 276개 모두 통과.
- 한계: 내장 브라우저 칸이 좁아 1280 화면은 넘침 수치만 확인하고 그림으로는 일부만 봄. 이 PC 브라우저가 움직임 줄이기 설정이라 말하는 그림 1·2 번갈아 보이기는 그림으로 못 봄(1만 쓰는 것 확인). 실제 기기 음성·토스 기기 화면은 미확인(T278).

### 2026-11-14 참고 화면 반영 v3 (T284, Windows, 외부 전송·실제 소리 없음)

- 피그마 파일 링크는 받지 않아 피그마에서 직접 읽지 않음. 사용자가 보낸 참고 그림 7장(캐릭터 앱 시안·토스 동네걷기 등)의 배치만 따름(그림·상표는 가져오지 않음).
- 시험 서버(47993, 임시 데이터)에서 확인: 375 화면 넘침 없음·무대·인사말("좋은 저녁이에요")·친구 카드 1개. 시험 캐릭터 "QA4-친구2"(분홍)를 만들어 카드로 바꾸기 → 무대 색 분홍·이름·입력 이름표·상태 글이 바뀜("이제 QA4-친구2 차례예요.") → 원래 캐릭터로 되돌리고 QA4-친구2 지움(남은 캐릭터: QA4-시험만).
- 1280 화면 넘침 없음, 대화 1회(실제 Ollama, 캐릭터 바꾼 뒤라 약 15초) 답 "시험, 만나서 반가워." 말풍선·소리(가짜 음성으로 글만 받음)·대화 수 2.
- 검사: `npm test` 276개 모두 통과.
- 한계: 1280 그림은 칸이 좁아 일부만 봄. 실제 기기 소리·토스 기기 화면 미확인(T278). 치이카와 그림은 아직 없음(T283).

### 2026-11-14 치이카와·산리오 캐릭터 고르기 (T285·T286, Windows, 외부 전송·실제 소리 없음)

- 시험 서버(47993, 임시 데이터)를 새 경로 반영을 위해 다시 켬(사용자 서버 47989는 건드리지 않음).
- 자비스 모드: "친구 고르기" 창에 두 묶음 12명, 처음 초점은 "닫기", 고르면 창이 닫히고 그 캐릭터로 바뀜. Edge 헤드리스 390 화면에서 창 폭 0~390(넘침 없음), 1280 화면 넘침 없음.
- 치이카와를 골라 실제 대화 1회(Ollama gemma4:12b): 답이 치이카와 말투 설명대로 짧은 감탄사를 섞어 나옴. 브라우저 음성은 가짜로 바꿔 소리 없음.
- 그림 6장: docs/screenshots/01~06 (사용자에게 파일로 보냄).
- 검사: test/character-presets.test.js 3개 통과(목록 저장 규칙 통과, 같은 이름 다시 적용·고친 말투 유지, 토큰·404·자비스 모드 상태 반영). 전체 `npm test` 279개 모두 통과.
- 한계: 이름은 실제 작품 캐릭터 이름이며 그림은 넣지 않음. 그림은 사용자가 쓸 권리를 확인하고 직접 넣어야 함(T283).

### 2026-11-14 쉬는 화면·깨우기 (T287, Windows, 외부 전송·소리·실제 카메라 없음)

- 판단 모듈 검사 test/presence.test.js 4개: 밝기만 바뀐 것은 움직임 아님, 1분 idle·3분 쉬는 화면·누르면 깨어남, 쓰는 중에는 카메라 안 켬·15초/30초 간격, 움직임 또는 지난번과 다른 장면(가만히 선 사람)이면 깨어남·근접도 깨움.
- Edge 헤드리스(임시 프로필, 390 화면)로 실제 3분 기다림: 쉬는 화면 켜짐, 뒤 화면 inert, 캐릭터 움직임 없음, 5초 동안 얼굴 다시 그리기 0회, 시계 표시. 쉬는 화면을 누르면 깨어나고 말풍선 "어서 와요! 무엇을 도와줄까요?". 그림: docs/screenshots/07-sleep-screen.png.
- 이 PC에는 카메라가 없어 "카메라로 깨우기"를 누르면 "카메라를 열지 못해 카메라로 깨우기를 껐어요."로 꺼짐(확인). 실제 카메라로 사람을 알아채는지·열·전력은 토스 기기·휴대폰에서 미확인.
- 근접 센서: 이 PC 브라우저는 제공하지 않아 장치 점검에서 "읽을 수 없음"으로 안내. 실제 기기 미확인.
- 검사: `npm test` 283개 모두 통과(server.test.js의 자비스 모드 가져오기 목록에 /static/presence.js 추가).

### 2026-11-14 얼굴 등록·알아보기 (T288, Windows, 가짜 카메라, 실제 얼굴 없음)

- 내려받기: 사용자 승인 뒤 face-api 1.7.15 파일 7개(라이브러리 1,333,462 · 얼굴 찾기 193,321 · 얼굴 점 77,224 · 얼굴 특징 6,444,032바이트 + 목록 3개)와 LICENSE를 따로 만든 빈 폴더에 받고, jsdelivr 공개 sha256과 모두 일치 확인 뒤 프로젝트로 옮김.
- Edge 헤드리스(임시 프로필, 가짜 카메라 = 움직이는 시험 무늬)로 확인: 카드 보임·빈 목록 안내, 빈 칸으로 찍기 → 이름·동의 오류와 초점 이동, 카메라 안 켬. 이름·동의 넣고 찍기 → 모델 준비 4초, 카메라 미리 보기(docs/screenshots/08-face-register.png), 얼굴이 없어 "충분히 찍지 못했어요"로 끝나고 아무것도 저장 안 됨. 카메라로 깨우기 켬 → 1분 뒤 idle에서 잠깐 보기가 움직임을 보고 "어서 와요!"로 깨어남. 정적 파일 11개 모두 200. 오류는 favicon 요청 404 1건(기존, 영향 없음).
- 검사: test/faces.test.js 3개(가장 가까운 사람·기준 밖은 모름, 이름·동의·인원 규칙, 깨진 저장 글 버림). `npm test` 286개 모두 통과.
- 한계: 실제 얼굴로 등록·알아보기 정확도와 토스 기기 성능·열은 미확인(T290).

### 2026-11-14 JARVIS 안드로이드 앱 (T291, Windows, 실제 기기 없음)

- 만들기: `node android/build.mjs`(ANDROID_SDK = 다른 프로젝트 SDK 폴더를 읽기만, JAVA_HOME = D:\Java\jdk-21) → android/out/jarvis-debug.apk 29,075바이트. apksigner 서명 확인 통과. 패키지 com.jarvishybrid.app 0.1.0, 최소 API 24, 목표 API 35, 권한 INTERNET·CAMERA·RECORD_AUDIO·MODIFY_AUDIO_SETTINGS.
- 화면 연결 확인: Edge 헤드리스에 가짜 window.JarvisApp을 넣고 /jarvis를 염. 소리 단추 보임, 장치 점검 "앱으로 실행 중 · 근접 센서 있음 · 기기 음성 준비됨"과 "연결 설정 열기" 동작. 대화 1번에서 브라우저 음성 대신 앱 음성(speak, 높이 1.3)을 부르고 말하는 얼굴 → 대기로 돌아옴. 3분 뒤 쉬는 화면에서 앱에 밝기 낮춤(dim true), 근접 알림으로 깨어나며 밝기 되돌림(dim false)과 "어서 와요!".
- 고침: 소리로 읽을 때 괄호 얼굴 문자((๑ᴗ<๑) 등)는 빼고 읽음(보통 괄호 글은 그대로).
- 검사: `npm test` 286개 모두 통과.
- 한계: 실제 안드로이드 기기·에뮬레이터에서 실행하지 않음(T292). WebView의 카메라·마이크 권한, 인증서 지문 맞추기, 근접 센서 값, TTS 한국어 음성은 기기에서 확인해야 함. 토스 기기 LineageOS 올리기는 사용자가 직접(T277).

### 2026-11-14 다른 자비스 아이디어 반영 (T293~T302, Windows, 가짜 마이크, 외부 전송 없음)

- 코드 읽기: isair/jarvis(9d90257)·OpenJarvis(76836f4)를 세션 임시 폴더에 얕게 받아 읽기만 함(실행·설치 안 함). 아이디어 목록 docs/reference-ideas.md.
- whisper.cpp v1.9.2 verbose_json에 구간 no_speech_prob·avg_logprob가 있음을 확인(Windows 음성으로 만든 WAV, 소리 재생 없음). VAD 없이 잡음만 넣으면 " RVIS"가 no_speech_prob≈0으로 나와 문장 목록도 함께 씀.
- 부르면 대답하기 실제 흐름(시험 서버 47993, Edge 헤드리스, 가짜 마이크 = Windows 음성으로 만든 파일, 실제 whisper·Ollama): 동의 창 → 켬 → "오늘 저녁은 비빔밥 먹을까 생각 중이야"는 쌓기만(대답 안 함) → "자비스, 비빔밥 말고 다른 저녁 메뉴 하나만 추천해 줘"에만 대답, 앞 대화(비빔밥)를 알고 다른 메뉴 추천 → 끄면 PC에 쌓인 말 0개. 이때 판정 모델이 6초 제한 안에 답하지 못해 규칙으로 처리됨 → 켤 때 모델 미리 올리기·제한 10초로 고침(고친 뒤 화면 흐름은 다시 돌리지 않음). 판정을 직접 부르면 3가지(이름 부름=맞음, "친구한테 자비스 얘기"=아님, 답 직후 "그럼 우산은?"=맞음) 모두 맞음, 각 2.5~3초. 그림 docs/screenshots/09~12.
- 오늘 브리핑: "지금 만들기" → 실제 Ollama 3.6초, 카드 글·듣기 단추·만든 시각 표시, 390 화면 넘침 없음(13-briefing.png).
- 승인 단계: 시험 작업(QA4-감기약·QA4-회의) → "위험 낮음" 배지·"낮음 4개 한꺼번에 승인" → 모두 승인됨(14-mission-tiers.png). 저전력 체크 상자 보임. 장치 점검 "PC 점검: 8개 항목 모두 정상"(15-pc-check.png). `node src/main.js --doctor` 정상 8.
- 검사: 새 시험 ambient 11·briefing 4·tiers 3·suggest-redact 5·doctor 2. 설정 응답에 lowPower가 더해져 fast-answer 시험의 기대값을 고침, 설정 화면 가짜 DOM 시험을 위해 저전력 체크 상자가 없을 때를 견디게 함. 전체 `npm test` 310개 모두 통과.
- 한계: 실제 마이크·스피커로 부르기·에코·"그만"은 미확인(T303). 기억 제안은 5분 기다림 흐름을 화면에서 돌리지 않음(시험으로만 확인). 아침 브리핑 자동 생성(06:00)은 시험 시계로만 확인. 사용자 서버(47989)는 다시 켜지 않아 아직 옛 코드로 돌고 있음.

### 2026-11-14 k-skill 연결 (T304~T307, Windows, 실제 외부 조회 없음)

- k-skill을 세션 임시 폴더에 얕게 받아 읽음(9766d20, 스킬 134개). 실행 방식 분류: 조회 서버 경유 조회 37개 중 설명서에 /v1/ 경로가 있는 29개만 연결. 실행 파일·npx 명령은 쓰지 않음.
- 실제 Ollama로 조회 계획만 확인(외부 호출 없음): 6개 질문 모두 맞는 경로·값(날씨 기본 위치 lat/lon, 부산은 부산 좌표, 다음 달 공휴일 2026-12, 강남역 도착, 미세먼지, 인공지능 뉴스), 5~14초.
- 시험 서버(47993, 임시 자료)를 PC 안 가짜 조회 서버(127.0.0.1:47995)로 돌림: 스킬 탭 29개·위치 검사 오류 문구·위치 저장·동의 창(처음 초점 "취소", 취소하면 꺼진 채)·켬. 자비스 모드 "내일 날씨 어때? 우산 챙겨야 해?" → 가짜 서버에 GET /v1/korea-weather/forecast?lat=37.5665&lon=126.978 한 번 → "내일은 11도에서 17도, 비 올 확률 60%, 우산 꼭 가져가" + "k-skill korea-weather로 찾아봤어요". 처음에는 15초 제한에 걸려 조회를 못 했고(→30초), 결과 날짜를 몰라 "자료 없음"이라 답해(→오늘 날짜 함께 넣음) 고침. 한 번에 약 19초. 그림 docs/screenshots/16~18.
- 검사: test/kskill.test.js 7개(설명서 사본, 경로 검사·.. 막기·비밀 값 가림, 동의 없으면 못 켬, 켠 스킬 조회 흐름·기억 안 보냄, 되묻기·설명서 밖 경로 거부·503·리다이렉트 실패 처리, 낱말 안 맞으면 모델 추가 호출 없음, 브리핑 날씨). 전체 `npm test` 317개 모두 통과.
- 한계: 실제 조회 서버로는 부르지 않음(T308). 느림(12b 모델로 3번 부름) — JARVIS_OLLAMA_FAST_MODEL로 작은 모델을 쓰면 빨라질 것으로 예상(미확인). 낱말 표에 없는 질문은 스킬을 쓰지 않음.

### 2026-11-14 디자인 계획 v4 (T310~T313, Windows)

- Higgsfield: 잔액 확인(시작 2,641크레딧) → 기본 4안(6크레딧) → 상태 4장(참고 그림 사용). 결과를 받아 투명 바탕 유지, 몸 높이·가운데를 맞춰 512px로 정리(대기·말하는 중 1·2는 같은 자리, 차이는 입 모양).
- Figma: 새 파일·변수·텍스트 스타일·부품·화면을 만들고 화면마다 캡처로 확인. 처음에 자동 맞춤이 풀려 부품이 잘려 보였고(크기 지정 뒤 다시 맞춤), 레이아웃용 틀에 흰 바탕이 깔려 어두운 화면 글자가 흐려 보여 바탕을 지움. 그림은 Figma 코드로 넣을 수 없어 HTML(그림 포함)로 캐릭터 시트를 올린 뒤 그 그림을 화면에 다시 씀.
- 앱 확인(시험 서버 47993, Edge 헤드리스, 390 화면): 친구 고르기에 "오리지널 친구들" 맨 앞·자비 미리 보기 그림 → 고르기 → 무대에 자비 그림, 이름 "자비", 상태 "자비 · 대기 중" → 대답 1번(실제 Ollama) 동안 그림이 3가지로 바뀜(생각 중·말하는 중 1·2), 넘침 없음, 오류 없음. 그림 docs/screenshots/19-picker-jabi.png, 20-jarvis-jabi.png.
- 검사: test/mascot.test.js 2개. 전체 `npm test` 319개 모두 통과.

### 2026-11-14 과일·간식 친구 12명 (T315, Windows)

- Higgsfield: 기본 모습 12장(높은 품질, 자비 그림을 그림체 참고로) → 모두 서로 다르고 원작과 헷갈리지 않음을 시트로 확인 → 상태 48장(중간 품질, 각 기본 모습 참고). 크레딧 2,629.63 → 2,587.63(42 사용).
- 크기·가운데 맞춤 뒤 상태 시트로 같은 모습 유지 확인(60장). 자비 그림은 mascot/jabi/로 옮기고 그림 폴더를 캐릭터별로 바꿈(경로 키는 영소문자만 허용).
- 앱 확인(시험 서버 47993, Edge 헤드리스): 친구 고르기 "오리지널 친구들" 13명 모두 미리 보기 그림, 키위 고르기 → 무대에 키위 그림·이름 "키위". 넘침·오류 없음. 그림 docs/screenshots/23-picker-friends.png, 24-jarvis-kiwi.png. Figma 04 캐릭터에 친구 시트(13:2) 추가.
- 검사: test/mascot.test.js(오리지널 13명 각 5장, 키위 적용, 잘못된 키 거부). 전체 `npm test` 319개 모두 통과.

### 2026-11-14 동물 친구 10마리 (T316, Windows)

- Higgsfield: 기본 모습 10장(아주 귀엽게, 큰 반짝이는 눈, 자비 그림체 참고) → 상태 40장. 크레딧 2,587.63 → 2,552.63(35 사용). 상태 시트로 50장 모두 같은 모습 유지 확인.
- 과일 친구 그림 폴더 12개를 지우고 동물 10마리 폴더로 바꿈. 친구 고르기 "오리지널" = 자비 + 동물 10마리(모두 미리 보기 그림). 곰돌 고르기 → 무대에 곰돌 그림·이름. 넘침·오류 없음. 그림 docs/screenshots/25-picker-animals.png, 26-jarvis-gomdol.png. Figma 04 캐릭터의 과일 친구 시트를 동물 친구 시트(15:2)로 바꿈.
- 검사: test/mascot.test.js(오리지널 11명 각 5장). 전체 `npm test` 319개 모두 통과.

### 2026-11-14 ECC(everything-claude-code) 스킬 적용 (사용자 요청)

- 원본 affaan-m/ECC(옛 everything-claude-code, MIT, d2ef268)를 세션 임시 폴더에 얕게 받아 검토. 스킬 314개 중 이 프로젝트에 맞는 11개만 프로젝트 `.claude/skills`에 복사(accessibility, api-design, coding-standards, tdd-workflow, verification-loop, security-review, search-first, eval-harness, database-migrations, design-system, git-workflow). 출처·라이선스는 `.claude/skills/_ecc/`.
- 위험 문구 검사 뒤 뺀 것: security-scan(전역 npm 설치), strategic-compact(전역 settings.json hook). 전역 `~/.claude`·hook·MCP 설정은 바꾸지 않음. ECC 스크립트는 넣지 않음.
- 한계: 새 스킬 목록은 다음 Claude Code 세션부터 잡힌다(이 세션에서는 확인 못 함).

## Phase 24: 2026-11-15 토스 프론트(PLF01WH, LineageOS 18.1) 실기 설치 (사용자 요청)

기기: 토스 프론트 1세대 PLF01WH(RK3399), LineageOS 18.1 arm64(Android 11, API 30), 800x1280 세로, 토스 SDK 없음. 화면 옆 PC(DESKTOP-IJJP8R7)와 USB(adb)로 연결.
연결 방식: 기기 앱 → https://127.0.0.1:4780 → adb reverse(USB) → 옆 PC의 JARVIS 서버. 개발 PC(DESKTOP-UP3FQHL)는 다른 Tailscale 계정·다른 망이라 기기에서 닿지 않아, 옆 PC에 같은 코드(git archive)를 두고 Ollama(gemma3:4b)·whisper CPU를 새로 설치함.

- [x] T317 JARVIS 앱 0.2.x: 전체 화면(상태 줄·단추 줄 숨김), 잠금 화면 위에 보이기·화면 켜기, 부팅 때 자동 열기(BootReceiver + adb appops SYSTEM_ALERT_WINDOW allow), 연결 실패 시 15초마다 다시 연결, 자비 아이콘. 실기: 설치·권한(마이크·카메라)·연결 설정·인증서 지문·자비스 모드 화면·재부팅 뒤 자동 열기 확인 (android/)
- [x] T318 PC 음성 대체 `POST /api/tts`: 기기에 음성 엔진이 없고(LineageOS에 TTS 엔진 없음) WebView에 speechSynthesis가 없어 답을 못 읽던 문제. PC 음성(Windows Heami)으로 WAV를 만들어 기기 스피커로 재생. 실기: 기기 앱의 AAudio 재생 시작 확인(dumpsys audio). 사람 귀로 듣기는 미확인 (server.js, services.js, jarvis.html, test/tts.test.js)
- [x] T319 Ollama 생각(think)을 모르는 모델(gemma3:4b): 400 "does not support thinking"이면 think 없이 한 번 다시 보내고 기억. 실기: 기기에서 글 질문 → 한국어 답(첫 질문 약 4초) (adapters.js, test/ollama-nothink.test.js)
- [x] T320 옆 PC 다리 `scripts/tossfront-bridge.ps1`: 서버가 꺼져 있으면 켜고 adb reverse를 15초마다 다시 건다. 옆 PC 시작프로그램에 등록(로그인 때 자동)
- [ ] T321 기기 마이크로 실제 말해 보기: 앱에서 녹음은 시작됨(입력 장치 Built-In Mic·HDMIIn, WebView 녹음 CAMCORDER). 첫 시험은 "말소리를 듣지 못했어요" — 사용자가 말했는지·마이크 배선이 살아 있는지 미확인. 안 되면 USB 마이크(OTG) 필요 — 사람이 해야 함
- [ ] T322 기기 음성 엔진: Play 스토어에서 "Google 음성 인식 및 합성"(com.google.android.tts)을 받으면 기기 음성(앱 TTS)을 씀(지금은 PC 음성 대체). 구글 계정 로그인은 사용자가
- [ ] T323 와이파이·Tailscale로 붙기(USB 없이): 옆 PC 방화벽이 4780을 막음(관리자 권한 필요). 또는 개발 PC를 기기와 같은 Tailscale 계정에 넣거나 공유해야 큰 모델(gemma4:12b·CUDA whisper)을 씀
- [ ] T324 근접 센서 없음(기기 센서 목록에 없음) → 깨우기는 화면 누르기·카메라로 깨우기만. 카메라(앞 2개)로 깨우기·얼굴 알아보기 실기 확인 — 사람이 해야 함


### Phase 24 검사 결과 (2026-11-15 KST)

- 개발 PC(Node 24.19.0): 전체 npm test 324개, 322 통과·2 건너뜀·0 실패. 새 검사: /api/tts 3개, think 모르는 Ollama 모델 2개.
- 옆 PC(Node 24.11.1): doctor 8개 모두 정상, 글 질문 → 한국어 답(로컬 gemma3:4b, 첫 성공 약 4초), TTS WAV 149,944바이트 약 0.7초 합성·임시 파일 0개. 기기 앱 AAudio 재생 시작 확인.
- 기기 재부팅 2회: 0.2.0에서는 잠금 화면이 가려 0.2.1에 setShowWhenLocked/setTurnScreenOn 추가. 0.2.1 재부팅 뒤 앱이 최상단으로 자동 실행됨.
- 스크린샷(작업자 box): /workspace/jarvis-tf/02-jarvis.png, 05-answer-speaking.png, 06-check.png, 07-after-reboot.png, 08-mic.png. 옆 PC에도 C:\Users\coba8\jarvis-shots에 보관.
- 사용자 실제 조작이 관찰되어 이후 마이크·카메라 자동 조작은 중단. 실제 발화·스피커 청취는 사람이 확인해야 함.

## Phase 26: 2026-11-15 캐릭터 립싱크·움직임 (사용자 요청 "1번과 2번 다")

- [x] T325 립싱크: PC 음성(WAV)은 소리 크기를 미리 계산해 재생 위치에 맞춰 입을 3단계(다묾·작게·크게)로 연다. 브라우저 음성은 단어 알림(boundary) 박자, 알림이 없으면(앱 음성·PC 스피커) 말소리 같은 박자. 움직임 줄이기면 입을 반쯤 연 채 멈춤 (avatar.js `wavEnvelope`·`levelMouth`·`wordMouth`·`syllableMouth`, jarvis.html)
- [x] T326 움직임: 대기·듣기에서 눈 깜빡임(2.5~6초마다 0.15초, 가끔 두 번), 들을 때 목소리 크기만큼 커지기, 이름을 부르거나 말하기를 누르거나 쉬는 화면에서 깨면 깡충, 답을 마치면 끄덕. 얼굴을 #face > .fx > .body 세 겹으로 나눠 움직임이 겹치지 않게 함. 그리기는 1초 약 30번(requestAnimationFrame) (jarvis.html, avatar.js `createBlinker`·`createLevelMeter`)
- [x] T327 그림 상태 2개 추가: `speaking3`(입 다묾)·`blink`(눈 감음). 자비+동물 친구 10마리 = 22장 새로 그림(gpt_image_2_6, 크레딧 약 11). 다른 부분이 바뀌지 않게 새 그림에서 눈(깜빡임)·입(입 다묾) 부분만 떼어 기존 그림에 붙임(겹침 비율 0.986 이상). 없으면 speaking2·대기 그림으로 대신 (avatar-images.js, index.html, src/character/mascot/*/blink.png·speaking3.png)
- [x] T328 예전에 5장만 받은 친구는 다시 고르면 빠진 2장만 채움(대기 그림이 원래 그림 그대로일 때만, 사용자가 바꾼 그림은 그대로) (presets.js `applyMascot`)
- [ ] T329 앱 음성(안드로이드 TTS)의 단어 위치 알림(onRangeStart → 'jarvis-app' range): 화면은 받을 준비만 함. 앱(MainActivity.java)은 아직 안 보냄 — 기기에 음성 엔진이 생기면 검토
- [ ] T330 토스 기기에 적용: 기기는 옆 PC 서버(USB adb reverse)를 쓰므로 옆 PC에 새 코드를 옮기고 서버를 다시 켠 뒤 친구를 다시 골라야 새 그림 2장이 들어감 — 사람이 해야 함

### Phase 26 검사 결과 (2026-11-15 KST)

- 전체 npm test 334개 모두 통과(새 검사: 립싱크·WAV 소리 크기·박자·마이크 크기·깜빡임·도형 눈 감기·빠진 그림 채우기).
- 헤드리스 Edge(--mute-audio, 가짜 마이크, 소리 없음), 시험 서버 127.0.0.1:47993: 대기 12초에 깜빡임 2번(약 0.17초), 브리핑 읽기(PC 음성 WAV) 17초 동안 입 다묾 285·작게 117·크게 149 프레임으로 소리에 맞춰 바뀜, 끝나고 끄덕 확인, 말하기 단추에 깡충·듣기 상태·목소리 크기 1까지 확인. 390px 화면 가로 넘침 없음.
- 실제 기기·사람 눈으로 본 확인은 아직. 대화 답으로 말하기 시험은 로컬 Ollama가 응답하지 않아 브리핑 읽기로 대신함.

## Phase 27: 2026-11-15 단축키 판·구글 캘린더·Tasks·캐릭터 모션 (사용자 요청)

사용자 결정(2026-11-15): 단축키는 "자비스 + PC 조작", 구글은 "보기 + 추가·완료", 아침 브리핑에 "넣기". 같은 날 "캐릭터 모션을 최대한 귀엽고 다양하게".
다른 작업자(커밋 작성자 JUX Design)가 jarvis.html을 함께 고치고 있어, 새 화면 코드는 deck.js·deck-settings.js·deck-icons.js·motion.js로 따로 두고 jarvis.html·index.html에는 연결 몇 줄만 넣음.

- [x] T331 단축키 판 서버: 버튼 저장·검사(최대 24개, 이름 20자, 아이콘·색 목록), 기본 버튼 6개, 누르기. PC 조작(프로그램·단축키·웹 주소)은 쉘 없이 spawn 인자 목록, 단축키는 키 이름 → 숫자 코드(Windows keybd_event, Mac System Events key code). PC 조작 버튼은 이 PC 주소에서만 만들고 고침(다른 기기 403 pc_local_only), 같은 버튼 겹쳐 누르기 막음 (src/shortcuts/shortcuts.js·pc-runner.js, /api/shortcuts)
- [x] T332 구글 연동 서버: OAuth(PKCE·state, 127.0.0.1 임시 포트로 돌아옴, 5분), 열쇠 파일 저장·자동 새로 받기·401 한 번 다시·연결 취소되면 파일 지움, 일정 보기(오늘부터 1~31일)·추가(시각/하루 종일), 할 일 보기·추가·완료, 1분 캐시, 연결 끊기(구글에 취소 알림). 쓰기는 confirm: true 필요, 연결 시작은 이 PC 화면에서만 (src/integrations/google.js, /api/google*)
- [x] T333 아침 브리핑에 구글 오늘 일정·할 일(연결돼 있을 때만, 이 기기 안 모델) (briefing.js `agenda`)
- [x] T334 메인 화면: 요약 타일 "오늘 일정·남은 할 일"(누르면 일정·할 일 화면), 단축키 카드(색·아이콘 큰 버튼, PC 버튼은 작은 점 표시), 일정·할 일 화면(7일 일정 날짜별, 할 일 완료 버튼, 추가 양식, 확인 창은 주황 단추) (src/server/public/deck.js, deck-icons.js)
- [x] T335 설정 화면 "단축키·구글" 탭: 구글 연결·끊기·준비 방법, 버튼 추가·고치기·지우기·순서·기본으로 되돌리기 (src/server/public/deck-settings.js)
- [x] T336 캐릭터 모션 기획·적용: 한 번 하는 동작 16가지(깡충·끄덕·갸웃·두리번·꼬물꼬물·콩콩·기지개·빙그르·만세 점프·시무룩·수줍·꾸벅·흔들흔들 인사·뿅 등장·깜짝·둠칫), 듣기·생각 반복 다듬기, 생각 점, 머리 위 감정 표시 8종(최대 6개), 답 내용 반응, 얼굴 누르기 3단계, 친구별 성격(느긋·활발·수줍·보통), 캐릭터가 가려진 동안 사건 동작은 미뤘다가 다시 보일 때 함 (docs/CHARACTER_MOTION.md, src/server/public/motion.js)
- [ ] T337 실제 구글 계정으로 연결 확인 — 사용자가 Google Cloud에서 OAuth 클라이언트를 만들고 .env.local에 넣은 뒤 직접 로그인해야 함(외부 전송)
- [ ] T338 실제 PC 조작 확인 — 프로그램 열기·단축키 보내기·웹 주소 열기를 사용자가 직접 버튼을 만들어 눌러 봄(이번에는 가짜 실행기로만 검사, Windows 키 스크립트는 키 없이 컴파일만 확인). Mac은 손쉬운 사용(자동화) 권한 필요
- [ ] T339 토스 기기·사람 눈으로 모션 확인(성능·귀여움). 기기는 옆 PC 서버를 쓰므로 옆 PC에 새 코드를 옮겨야 함(T330과 같음) — 사람이 해야 함
- [ ] T340 (제안) 대화로 일정·할 일 묻고 넣기("오늘 일정 뭐야?", "할 일에 우유 사기 넣어 줘") — 승인·외부 전송 설계 뒤 검토

### Phase 27 검사 결과 (2026-11-15 KST)

- 전체 npm test 374개 모두 통과(새 검사: google 11, shortcuts 10, motion 7, server 정적 파일 목록).
- 실제 구글·실제 PC 조작은 하지 않음. 가짜 구글(fetch)·가짜 실행기로만 확인. 로그인 받는 곳(127.0.0.1 임시 포트)만 실제로 열어 시험.
- PowerShell keybd_event 스크립트: 누를 키 없이 컴파일만 확인(종료 0).
- 헤드리스 Edge(소리 끔), 가짜 구글 시험 서버 127.0.0.1:47997: 단축키 8개·타일(오늘 일정 2·할 일 3)·일정 화면(일정 4·할 일 3)·할 일 추가 확인 창·PC 버튼 누름("PC에서 했어요")·설정 탭(버튼 8줄·연결됨) 확인. 390px·1280px 가로 넘침 없음.
- 모션(토리): 처음 열 때 뿅→인사, 얼굴 세 번 누르기 꼬물꼬물→콩콩→빙그르(하트 최대 6), 대기 12초 잔동작, 할 일 완료 뒤 돌아오면 만세 점프(별), 멈추기 깜짝, 움직임 줄이기에서는 아무 동작·감정 표시 없음.

## Phase 28: 2026-11-15 회의·토론 기능 확인, 캐릭터 아래 바로 가기 줄 (사용자 요청)

확인(2026-11-15): 회의 기능은 있음 — 설정 화면 회의 탭에서 마이크 녹음(15~30초 조각·순서 번호)·음성 파일 가져오기·시간별 받아쓰기·검색·구간 듣기·지우기(T120~T123, T233, FR-008a~c). 실제 마이크 확인은 아직(T235). 메인 화면에는 "저장된 회의" 수 타일만 있었음.
토론 기능은 없음 — 코드·spec·tasks·README 어디에도 없음(원본 MASTER_SPEC.md도 아직 확보 전, T007).

- [x] T341 캐릭터 바로 아래 바로 가기 줄: 회의 · 스트림덱 · 단축키 버튼들 · 고치기(옆으로 넘김, 넓은 화면은 가운데). 예전 단축키 카드는 이 줄로 옮김 (deck.js)
- [x] T342 스트림덱: 단축키 판 전체 화면 창(회의 버튼 + 단축키 버튼, 넓은 화면 한 줄 8개). 화면을 바꾸는 버튼은 창을 닫고 실행 (deck.js)
- [x] T343 메인 화면 회의 녹음: 확인 창(함께 있는 사람에게 알리기) → 이 기기 마이크로 녹음(설정 화면과 같은 조각·순서 번호·다시 보내기, 마이크 설정은 말하기 버튼과 같음) → 녹음 중 빨간 표시·시간·마지막 받아 적은 말 → 끝내면 회의록 저장 알림·만세 점프. 녹음 중에는 말하기 마이크를 막고 부르면 대답하기를 쉼, 쉬는 화면으로 가지 않음, 창 닫기 경고 (meeting-rec.js, deck.js, jarvis.html 몇 줄)
- [ ] T344 실제 마이크로 메인 화면 회의 녹음·받아쓰기 확인(토스 기기·PC) — 사람이 해야 함(T235와 같이)
- [x] T345 토론 기능 — 사용자 결정(2026-11-15): "회의 의견·결론 정리". 구현은 Phase 29(T346~)

### Phase 28 검사 결과 (2026-11-15 KST)

- 전체 npm test 376개 모두 통과(새 검사: 회의 조각 나누기 규칙 2개, 정적 파일 목록). 다른 작업자의 mic-lifecycle 검사(micStart만 떼어 실행)에 맞춰 회의 확인을 typeof로 안전하게 함.
- 헤드리스 Edge(가짜 마이크, 소리 끔), 가짜 구글 시험 서버 127.0.0.1:47997: 바로 가기 줄 11개(회의·스트림덱·단축키 8·고치기)가 캐릭터 무대 안에 있음, 스트림덱 창 9칸, 회의 확인 창 → 녹음 6초(누름 표시·"회의 녹음 중 00:05") → 녹음 중 말하기 막힘 → 끝내기 → 서버에 회의 저장(약 6.3초, 상태 stopped). 시험 서버는 받아쓰기 엔진이 없어 구간 0개. 390px·1280px 가로 넘침 없음.

## 2026-11-15 카메라로 깨우기 고침 (사용자 신고: "카메라 앞에 갔는데 대기화면에서 앱화면으로 넘어가지 않아")

기기는 아직 이 PC와 연결이 안 돼(Tailscale 목록에 없음) 옆 PC 서버의 커밋된 코드를 쓴다. 코드로 본 원인 후보 3가지를 고침(jarvis.html glance만, presence.js 판단 규칙은 다른 작업자 설계 그대로).
- [x] T350 잠깐 보기를 늘 320×240으로(등록한 사람이 없으면 160×120이라 얼굴이 작아 "얼굴 없음" → 움직임이 있어도 안 깨던 문제)
- [x] T351 얼굴 확인을 두 장면(밝기 맞춘 직후·0.4초 뒤)에서 하고 하나라도 보이면 사람 있음
- [x] T352 카메라를 한 번 못 열었다고 카메라로 깨우기를 영구히 끄지 않음: 권한 거부·카메라 없음만 바로 끄고, 일시 오류(다른 앱이 사용 중 등)는 3번 연달아일 때만 끔. 로그 "[presence] cam error … fails=N"
- [ ] T353 토스 기기에서 실제로 앞에 서서 깨어나는지 확인(쉬는 화면에서는 30초마다 한 번 보므로 최대 30초쯤 걸림), 로그의 face score 확인 — 사람이 해야 함. 옆 PC에 새 코드를 옮겨야 기기에 들어감

검사: presence·faces·server·mic-lifecycle 25개 통과. 헤드리스 Edge 가짜 카메라: 요청 크기 320x240, 켜기 정상, 일시 오류(NotReadableError) 한 번 뒤에도 켜진 채 다음 차례에 다시 봄. 실제 얼굴로 깨우기는 미확인(가짜 카메라에는 얼굴이 없어 face=false → 설계대로 안 깸).

## Phase 29: 2026-11-15 회의 의견·결론 정리 (사용자 결정, FR-017)

- [x] T346 정리 서버: 녹취를 [mm:ss] 줄로 만들어 이 기기 안 모델에만(JSON·생각 생략·keepAlive 정책) 보내 요약·의견(시간)·정한 것·할 일·남은 질문으로 정리. 모델 답의 첫 {...}만 읽고 칸 길이·개수 제한, 비밀처럼 보이는 값 버림, 녹취 밖 시간은 뺌. 긴 녹취는 8000자씩 최대 8조각 → 부분 정리 → 합치기. 같은 회의 동시 요청은 하나로. 이 기기 안 모델 없음·녹음 중·녹취 없음·답을 못 읽음은 알림 (src/meeting/summary.js)
- [x] T347 저장·삭제: meeting_summaries 표(회의마다 하나). 회의 지우기·버리기·녹취 지우기 때 함께 지우고 scrub (db.js, meetings.js)
- [x] T348 API: GET·POST /api/meetings/:id/summary (server.js, services.js)
- [x] T349 설정 → 회의: 회의마다 "의견·결론 정리"(다시 정리) 버튼과 결과(요약·나온 의견·정한 것·할 일·남은 질문), 의견 시간을 누르면 그 위치부터 원음 듣기. 녹취 목록은 그대로 둠 (index.html)
- [x] T350 메인 화면: 회의 녹음을 끝내면 받아 적은 말이 있을 때 이어서 정리하고 한 줄로 알림(대화 기록에도), 전체는 설정 → 회의로 안내 (deck.js). jarvis.html·presence.js는 건드리지 않음(다른 작업자·원래 세션이 고치는 중)
- [ ] T351 실제 Ollama(gemma4:12b)로 실제 회의 녹취 정리 품질 확인 — 사람이 결과를 보고 판단해야 함

### Phase 29 검사 결과 (2026-11-15 KST)

- 전체 npm test 386개 모두 통과(새 검사 meeting-summary 10개: 시간 글, 녹취 나누기, 모델 답 읽기·제한·지어낸 시간 빼기, 요청 규칙, 이 기기 안 모델에만 보내고 저장, 긴 녹취 나눠 합치기, 거부 경우, 동시 요청 하나로, 지우면 정리도 지움, API).
- 헤드리스 Edge(가짜 마이크, 소리 끔), 가짜 이 기기 안 모델·가짜 받아쓰기 시험 서버 127.0.0.1:47998: 설정 → 회의에서 "의견·결론 정리" → "정리하는 중…" → 결과 5줄(의견 2·정한 것 1·할 일 1·남은 질문 1)과 "다시 정리", 390px 가로 넘침 없음. 메인 화면 회의 녹음 4초 → 끝내기 → "정리하는 중…" → "회의 정리: …(의견 2개 · 정한 것 1개 · 할 일 1개)".
- 의견 시간 단추는 녹음한 회의의 원음을 불러옴(재생 창 보임). 헤드리스에서는 사용자 누름이 아니라 자동 재생이 막혀 실제 소리 재생은 미확인(기존 녹취 시간 단추와 같은 방식).
- 실제 Ollama·실제 마이크는 쓰지 않음.

## 2026-11-15 토스 기기 설치 시도 (사용자 요청 "설치까지 직접해")

- 이 PC에서 닿는지 확인: 기기(phh-treble-vanilla)는 Tailscale 목록에 없음(공유 안 됨), adb 연결 기기 없음, 옆 PC(DESKTOP-IJJP8R7)는 이름을 찾지 못함(다른 망 192.168.45.x·다른 Tailscale 계정 coba8002). 그래서 직접 설치는 못 함. Tailscale 공유·로그인은 사용자 몫.
- [x] T354 설치 꾸러미: `dist/jarvis-update.zip`(지금 작업 사본 339개 파일, .claude·.specify·data·tools·.env.local 제외, SHA-256 97e6ffac250e0970a0e8d283bcf711218f2ba935fd657101d73a9c860b6e0136) + `dist/apply-update.cmd`(= scripts/apply-update.cmd). dist/는 .gitignore에 더함
- [x] T355 `scripts/apply-update.cmd`: 해시 보여 주기 → 그 폴더의 JARVIS 서버·USB 다리 끄기 → 백업(data·tools·logs·.env.local 제외) → 새 코드 덮어쓰기(data·tools·logs·.env.local 그대로) → 시작프로그램의 다리 .cmd 다시 켜기. 관리자 권한·방화벽·실행 정책 변경 없음. 가짜 폴더로 시험: 새 코드 들어감, .env.local·data 그대로, 백업 생김, 그 폴더의 node 서버 꺼짐
- [ ] T356 옆 PC에 꾸러미 넣기(사람이 파일을 옮겨 더블클릭) 또는 기기를 이 PC Tailscale에 공유 + 기기 "네트워크로 ADB" 켜기 → 이 PC 서버(47989, gemma4:12b)로 앱 주소를 바꿔 직접 설치·확인

## 2026-11-15 기기에서 서버 바꾸기 · AI 고르기 (사용자 요청: "해당 기기로 서버변경을 쉽게 할 수 있게 해주고 claude 나 codex api, lamma, 로컬로 선택 연결")

- [x] T357 JARVIS 앱 0.2.6(versionCode 8): 연결 화면에 "저장된 서버" 목록(이름·주소·지문, 최대 8개, 누르면 바로 바꿈, 길게 누르면 지우기, 지금 연결 표시), 새 서버 칸에 "이름"을 적으면 목록에 저장, 화면에서 들어왔으면 "바꾸지 않고 돌아가기". ConfigReceiver에 `--es name …`(목록에도 넣기)·`--ez switch false`(목록에만) 추가 (android/…/ServerList.java·MainActivity.java·ConfigReceiver.java). 빌드: `node android/build.mjs`(ANDROID_SDK=D:\web-auto\pet_senseuild\mobile-toolsndroid-sdk 읽기만, JAVA_HOME=D:\Java\jdk-21.0.12.1+1) → android/out/jarvis-debug.apk 131,881바이트
- [x] T358 메인 화면 바로 가기 줄에 "서버" 버튼(기기 앱일 때만, 앱 연결 화면 열기)과 "AI" 버튼 (deck.js)
- [x] T359 AI 고르기: 이 PC 안(로컬 Ollama 기본 모델 + 받아 둔 모델들, 임베딩 모델 뺌 · Llama(llama.cpp llama-server, 기본 127.0.0.1:8080/v1, 키 없음)) / 인터넷(Claude · Codex(OpenAI) · Grok). 쓸 수 없는 것은 이유(키 없음·모델 이름 없음·외부 전송 꺼짐)만 보이고 못 고름. 외부 AI는 고를 때 확인 창(질문 글만 감, 요금). 고른 것은 그 기기 브라우저에만 저장. 서버는 외부 AI에 기억·주변 대화·스킬 자료를 넣지 않음(기존 규칙) (adapters.js `llama`·`readiness`·`PROVIDER_LABELS`·`ollama.models`, contract.js, registry.js, server.js `/api/providers/ollama/models`, jarvis.html providerModel·setAi)
- [ ] T360 기기에 앱 0.2.6 설치·저장된 서버 넣기(옆 PC 4780, 이 PC 4781)·확인 — 기기 공유(Tailscale)·네트워크 ADB 허용 뒤
- [ ] T361 실제 Claude·Codex 연결 확인 — 사용자가 .env.local에 키·모델(JARVIS_OPENAI_MODEL)을 넣고 JARVIS_ALLOW_REMOTE=1로 켜야 함(외부 전송·요금). Llama는 llama-server를 켜야 함(이 PC에 없음), Ollama에 라마 모델은 아직 없음(받기는 사용자 결정)

검사: 전체 npm test 390개 통과(새: ai-choice 4개). 헤드리스 Edge(가짜 JarvisApp, 이 PC 로컬 Ollama 목록): 바로 가기 줄 "회의·스트림덱·로컬·서버…", 서버 버튼 → openSetup 1번, AI 목록 로컬 모델 9개 + Llama + Claude(외부 전송 꺼짐)·Codex(모델 이름 없음)·Grok, 쓸 수 없는 것 누르면 이유만 알림. 앱 0.2.6은 빌드만, 기기 설치 전.

## 2026-11-15 대기화면 보드 (사용자 요청: "대기화면은 캐릭터의 간단하고 코믹스러운 애니메이션 … 날씨 정보, 오늘 중요한일 … 해야 할일 리스트 … ax.designjux.com과 나중에 연동", "캐릭터는 선택한 캐릭터가 보여진다")

- [x] T362 대기화면 자료 API `GET /api/board`: 날씨(k-skill 날씨 스킬을 켜고 기본 위치가 있을 때만, 단기예보 전체 JSON을 읽어 지금 기온·하늘·오늘 최저/최고·남은 시간 비 확률, 30분 캐시) · 오늘 중요한 일(구글 오늘 일정 + 기한이 오늘·지난 할 일, 최대 6) · 해야 할 일(최대 8, 전체 수). `GET/PUT /api/board/settings`(할 일 가져오는 곳) (src/board/board.js, kskill.js `call(…, { full })`)
- [x] T363 할 일 가져오는 곳: 지금 구글 Tasks. ax.designjux.com은 "나중에 연동"으로 목록에만 두고 고를 수 없게 함(설정 → 단축키·구글 → 대기화면) — 연동할 때 board.js TODO_SOURCES에 가져오기만 더하면 됨
- [x] T364 대기화면 화면(idle-board.js): 큰 시계·날짜, 지금 고른 친구가 눈 감은 그림(blink)으로 꾸벅꾸벅 + Z 떠오름, 14~24초마다 코믹 잠꼬대 6가지(깜짝 깸 "헉! …아니구나"(눈 뜬 그림), 뒤척이기(좌우 뒤집기), 하품, 콧방울 부풀다 펑, 꿈(별) "냠냠… 한 입만…", 꾸벅꾸벅), 날씨 칸, 오늘 중요한 일·해야 할 일 카드. 세로(토스 기기 800×1280)는 한 줄, 가로 넓은 화면은 두 칸. 1분마다 몇 px 옮겨 번인 줄임, 1분마다 친구 그림 다시 맞춤. 움직임 줄이기면 잠든 그림만
- [ ] T365 ax.designjux.com 할 일 연동 — 사용자 결정 뒤(주소·인증 방식 확인 필요)
- [ ] T366 토스 기기에서 대기화면 확인(밝기 낮춤 setDim과 함께 읽히는지, 열·번인) — 기기 연결 뒤

검사: 전체 npm test 395개 통과(새: board 5개 — 기상청 예보 읽기, 날씨 꺼짐·캐시, 중요한 일·할 일 고르기, 가져오는 곳, 잠꼬대·기한 글). 헤드리스 Edge(가짜 구글·가짜 날씨): 800×1280·1280×800에서 쉬는 화면으로 보내 확인 — 날씨 "12° 우리 집 · 구름 많음 · 최저 0° 최고 12° · 비 30%", 중요한 일 4개, 할 일 3개(구글 Tasks), 잠꼬대(꿈·하품·깜짝·꾸벅) 말풍선, 누르면 깨어남. 토리·곰돌로 바꿔 고른 친구가 보이는 것 확인. 실제 k-skill 날씨·구글 계정은 쓰지 않음.

## 2026-11-15 옆 PC(DESKTOP-IJJP8R7) 적용 준비 (사용자 요청 "Desktop-IJJP8R7 pc에 토스프론트 연결시켰으니 적용해줘 프로그램")

- 이 PC에서 확인: DESKTOP-IJJP8R7은 Tailscale(ldh97710)에 없고 이름도 못 찾음, adb 연결 기기 없음 → 직접 적용 못 함(다른 망·다른 계정, 원격 접속 수단 없음).
- [x] T367 `scripts/post-update.mjs`: 설치 파일 마지막 단계. 시작프로그램 다리 .cmd에서 adb 경로·기기 번호를 읽어(또는 --adb·--serial) 앱 apk를 `adb install -r`, 서명이 달라 안 되면 물어본 뒤에만 지우고 다시 설치(권한·부팅 자동 열기 appops 다시 켬), 데이터 폴더 인증서 지문으로 앱에 "옆 PC" 서버 저장·연결(ConfigReceiver), 서버가 뜨면(최대 90초, 지문 확인) 지금 고른 동물 친구를 다시 골라 빠진 그림 채움
- [x] T368 `apply-update.cmd` 6단계로: 같은 폴더에 jarvis-debug.apk가 있으면 위 마무리까지. dist/ 다시 만듦: jarvis-update.zip(346개 파일, SHA-256 38bc0b79325f2de444e7093eb59e8dba67758676ef9f83d0093509b138177c5e) · jarvis-debug.apk 0.2.6(SHA-256 76ff1be64e4645f7d762a0c70b00ffa938369df369f031247a741b5c7ec1344d) · apply-update.cmd · SHA256.txt
- [ ] T369 옆 PC에서 dist 폴더 4개 파일을 같은 폴더에 두고 apply-update.cmd 실행 — 사람이 해야 함(파일 옮기기)

검사: 전체 npm test 396개 통과(새: post-update 1개). 가짜 JARVIS 폴더로 apply-update.cmd 6단계 실행(기기·다리 없음 → 앱 설치는 "adb를 실행하지 못했어요", 서버 응답 없음 안내로 끝남, .env.local 그대로). post-update.mjs를 이 PC 47989 서버·실제 adb(기기 없음)로 돌려 봄: 지문 확인·토큰 받기·곰돌 다시 고름(새 그림 0장, 이미 7장) 정상, 기기 없음은 그대로 알림.
