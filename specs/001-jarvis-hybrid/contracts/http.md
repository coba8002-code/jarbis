# 로컬 화면 HTTP API (127.0.0.1 전용)

모든 `/api` 요청은 `x-jarvis-token` 머리글이 필요하다(화면에 실행마다 새로 넣음). Host가 이 기기 주소가 아니면 421.
오류: `{"error":{"code","message"}}`. not_found 404, 입력 오류 400, 상태 충돌(approval_required·invalid_state·memory_changed) 409, 공급자 오류 502.

| 방법 | 경로 | 설명 |
| --- | --- | --- |
| GET | /api/info | OS, Node 버전, 시작 때 복원한 항목 |
| GET | /api/missions?status= | 작업 목록 |
| GET | /api/missions/:id | 작업 상세(전송 작업은 preview 포함) |
| POST | /api/missions/:id/approve | `{version}` 보인 내용 버전으로 승인 |
| POST | /api/missions/:id/reject · cancel · run | 거절 · 취소 · 실행 |
| GET/POST | /api/quick, /api/quick/:name | 빠른 작업 목록 · 요청(`{params}`) |
| GET/POST/PUT/DELETE | /api/memories[?q=], /api/memories/:id | 기억 |
| GET | /api/providers | 공급자와 외부 여부 |
| POST | /api/chat | `{provider, question, memoryIds}`. 소리 읽기가 켜져 있으면 바로 보내는 답을 읽는다 |
| GET/PUT | /api/voice | 소리 읽기 상태 · `{enabled:boolean}` (끄면 읽던 것을 멈춤) |
| POST | /api/voice/stop | 읽는 말 멈추기 |
| GET | /api/meetings, /api/meetings/:id/segments | 회의 · 녹취 |
| DELETE | /api/meetings/:id | 회의 삭제(원음 먼저) |
| GET | /api/voices | 이 기기 OS 음성 목록 |
| GET/POST | /api/characters | 캐릭터 목록 · 만들기 `{name, persona, voice?, assets?:[{name,source,license}]}` |
| PUT/DELETE | /api/characters/:id | 캐릭터 수정 · 삭제(적용 중이면 적용 해제) |
| POST | /api/characters/:id/activate · /api/characters/deactivate | 적용 · 적용 해제 |
| POST | /api/characters/:id/preview | 그 목소리로 한 문장 말하기(실제 소리) |

`GET /api/voice`는 적용 캐릭터(`character`)도 함께 돌려준다. 소리 읽기 설정과 적용 캐릭터는 재시작 후에도 유지된다.

## 2026-11-14 추가

- 본문은 JSON 객체만 받는다(null·숫자·배열·문자열은 400 invalid_input). 1MB 초과는 413 payload_too_large(연결 유지).
- ID는 안전한 양의 정수만(아니면 400).
- 전송 미션 실행 때 승인한 주소·외부 여부·모델이 바뀌었으면 실패(target_changed)로 기록. 미리 보기도 ok:false.
- 끊긴 대화 답은 `reply.text: ""`, `reply.discarded: true`, `finishReason: "interrupted"`.
- `POST /api/voice/stop`은 소리로 읽는 차례(`stopped`)와 진행 중인 글 대화(`stoppedChats`: 끊은 수)를 함께 멈춘다. 끊긴 글 대화의 답은 버린다.
- `GET /api/stt`: 받아쓰기 상태 `{running, configured}`. `POST /api/stt`: 본문은 음성 파일 그대로(content-type `audio/*`·`video/webm`·`application/octet-stream`, 최대 25MB, 120초). 응답 `{text, seconds, ms, converted, broken}`. 엔진 없음 503 `stt_unavailable`, 엔진 오류 502 `stt_failed`. 음성은 저장하지 않는다.
- `GET /static/voice-input.js`: 화면의 발화 감지 스크립트(토큰 불필요, Host 검사 적용). 화면은 `permissions-policy: microphone=(self)`로 마이크를 이 화면에서만 허용한다.
- `POST /api/stt` 응답에 이름을 바로잡았으면 원래 받아 적은 글 `rawText`가 함께 온다.
- `GET/PUT /api/chat/settings`: `{fast:boolean}` 빠른 답(생각 생략). 켜면 바로 보내는 대화 요청에 `think:false`(Ollama). 외부 전송 미션 내용에는 넣지 않는다.
- 2026-11-14: `fast` 기본값은 true(설정이 없을 때). PUT으로 false를 저장하면 그 값을 유지한다.
- `/api/chat/settings`에 `autoThink`(기본 true) 추가. PUT은 `fast`·`autoThink` 중 하나 이상. 대화 응답에 `thinking: {mode: default|fast|auto-think, reason}`.
- `POST /api/meetings/import?title=`: 본문은 회의 음성 파일 그대로(`audio/*`·`video/webm`·`application/octet-stream`, 최대 200MB, 2시간). 이 기기 안 whisper(VAD 없는 회의용 엔진)로 받아 적어 회의·구간을 만들고 원음(16kHz WAV)을 저장한다. 응답 `{meeting, segments, clamped, dropped, ms, converted, broken, silentDropped}`. 실패하면 회의·원음을 남기지 않는다. 녹음 중인 회의가 있으면 409 `invalid_state`.
- `POST /api/stt?echo=check`: 받아쓰기와 함께 JARVIS가 지금·방금(8초 안) 스피커로 읽은 글과 비교한 결과 `{echo, echoOverlap, echoReason}`를 준다(T219). 읽던 답은 멈추지 않는다(멈춤은 화면이 정함). `echoReason`: `matches_spoken`·`different`·`stop_word`·`empty`·`nothing_spoken`.
- 2026-11-14(T232): 화면 마이크 녹음은 `audio/wav`(16kHz 모노 16비트)로 보낸다. 서버 변환 없이 받아 적는다(`converted:false`).
- 2026-11-14 회의 마이크 녹음(T233):
  - `POST /api/meetings/live` `{title?}`: 녹음 시작(빈 원음 파일). 녹음 중인 회의가 있으면 409 `invalid_state`.
  - `POST /api/meetings/:id/chunk`: 본문은 16kHz 모노 16비트 WAV 조각(`audio/wav`, 최대 8MB). 원음 뒤에 붙이고 받아 적는다. 응답 `{offsetMs, durationMs, segments, silentDropped, sttError?}`. 받아쓰기가 실패해도 원음은 남고 200(`sttError`). 형식이 다르거나 최대 2시간을 넘으면 400, 녹음 중이 아니면 409.
  - `POST /api/meetings/:id/stop`: 남은 받아쓰기를 기다린 뒤 멈춤. 응답 `{meeting, clamped, dropped, segments}`. 받은 소리가 없으면 회의를 없애고 `{meeting:null, empty:true, segments:[]}`. 화면이 끊겨 남은 "녹음 중" 회의도 이것으로 끝낸다.
  - 녹음 중 JARVIS가 꺼지면 다음 시작 때 `interrupted`로 두고 원음 머리글 크기를 맞춰 재생할 수 있게 한다.
- 2026-11-14 Phase 20:
  - `GET /api/meetings/search?q=`: 회의 제목·녹취 검색(FR-008a). 응답 `{query, results:[{meeting:{id,title,status,duration_ms,updated_at}, titleMatch, segments:[{id,start_ms,end_ms,text}]}], segmentCount, truncated}`. `%`·`_`·`\`는 글자 그대로. 빈 값·100자 초과는 400.
  - `POST /api/meetings/:id/chunk?seq=N`(FR-008b): N은 0부터 하나씩. 같은 N·같은 내용 재전송 → 다시 붙이지 않고 처음 결과에 `duplicate:true`. 같은 N 다른 내용·건너뛴 N → 409 `invalid_state`(메시지에 다음 번호), 잘못된 N → 400. 첫 응답에는 `seq`가 붙는다.
    호환: `seq` 없는 옛 호출은 예전처럼 붙인다(중복 방지 없음). 한 회의에서 섞으면 409. 번호 기록은 메모리에만 있고, JARVIS를 다시 켜면 녹음 중이던 회의는 interrupted라 더 붙일 수 없다.
  - `GET /api/quick` 항목에 `param`(입력 이름: `text` 또는 `q`). 새 빠른 작업 `memory-search`·`meeting-search`(`{params:{q}}`) → 승인 대기 미션. 실행 결과는 `{count, memoryIds}` / `{count, truncated, hits:[{meetingId, titleMatch, segments:[{id,start_ms,end_ms}]}]}`(원문 없음).
  - 캐릭터 `look: {shape: circle|rounded|drop, color: #RRGGBB, eyes: round|line|dot}`(만들기·수정, 없으면 기본 얼굴, `null`이면 기본으로). `GET /api/voice`의 `character`에 `look`. `GET /static/avatar.js`(토큰 불필요, 얼굴 그리기 스크립트).
- `GET /api/meetings/:id/audio`: 저장한 원음(`audio/wav`, 토큰 필요). 없으면 404. 화면 CSP는 `media-src 'self' blob:`.
