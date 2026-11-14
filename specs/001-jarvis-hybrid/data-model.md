# Data Model (1단계)

## missions
| 필드 | 설명 |
| --- | --- |
| id | 정수 |
| kind | 실행기 종류 (예: `mock.echo`) |
| title, target, content, impact | 사용자에게 보이는 내용. content는 JSON 문자열 |
| content_version | 위 내용의 SHA-256 |
| status | pending, approved, rejected, cancelled, running, done, failed, interrupted |
| approved_version | 승인 당시 버전. 내용 변경 시 NULL |
| source | `manual` 또는 `quick:<이름>` |
| result, error | 실행 결과·실패 이유 |
| created_at, updated_at | ISO 시각 |

상태 전이:
- pending → approved(버전 일치 시) / rejected / cancelled
- approved → running(조건부 선점) / cancelled / pending(내용 변경)
- pending → pending(내용 변경, 새 버전)
- running → done / failed; 재시작 시 running → interrupted
- rejected, cancelled, done, failed, interrupted 는 종료 상태(수정·실행 불가)

## mission_events
id, mission_id, at, from_status, to_status, note. 모든 전이를 기록.

## memories
id, content, tags(JSON 배열), created_at, updated_at. 삭제는 행 삭제(실제 삭제).
검증: 내용 비어 있으면 거부, 비밀 형태면 거부.

## quick actions (코드 등록)
name, description, kind, build(params) → {title,target,content,impact}. 실행 = 미션 생성(pending).

## 외부 전송 미션 (잠정, FR-010a)
kind `provider.send`. content:
`{ provider, model|null, question, memories: [{ id, sha256 }] }` — 기억 원문은 저장하지 않는다.
target: `provider:<이름> <주소>`. impact: 보내는 기억 수, 외부 저장 가능성.
실행 시 각 기억을 다시 읽어 해시가 같을 때만 보낸다. 다르거나 없으면 `memory_changed` 실패.
result: `{ provider, text, finishReason }`.

## meetings / transcript_segments (FR-008)
meetings: id, title, status(recording·stopped·interrupted), started_at, duration_ms(멈출 때 정함), audio_file(저장 폴더 안 파일 이름), created_at, updated_at.
transcript_segments: id, meeting_id, start_ms, end_ms(녹음 시작 기준 ms), text.
규칙: start_ms 0 이상 정수, end_ms > start_ms, 새 구간 시작 ≥ 앞 구간 시작, end_ms ≤ duration_ms(멈춘 뒤). 삭제는 원음 먼저, 실패하면 기록 유지.
원음 파일(2026-11-14): 데이터 폴더 `meetings/meeting-<id>.wav`, 16kHz 모노 16비트 WAV.
- 파일 가져오기: 받아 적은 뒤 한 번에 저장. 실패하면 회의·원음을 남기지 않는다.
- 마이크 녹음: 시작 때 머리글만 있는 빈 파일을 만들고, 조각이 올 때마다 뒤에 붙인다. 머리글 크기는 멈출 때 맞춘다.
  녹음 중 꺼지면 다음 시작 때 interrupted로 두고 머리글 크기를 실제 크기로 맞춘다. 받은 소리가 없으면 멈출 때 회의를 없앤다.

## characters / settings (US4, 잠정)
characters: id, name(50자 이하), persona(2000자 이하), voice(OS 음성 이름 또는 NULL), assets(JSON: [{name, source, license}] — 출처·이용 조건 필수), look(JSON {shape, color, eyes} 또는 NULL=기본 얼굴, 2026-11-14 추가·옛 DB는 열을 더함), created_at, updated_at.
검색 미션(2026-11-14): kind `local.memory.search`·`local.meeting.search`, content `{query}`. result는 번호만: `{count, memoryIds}` / `{count, truncated, hits:[{meetingId, titleMatch, segments:[{id,start_ms,end_ms}]}]}`.
settings: key, value(JSON). 사용 키: character.active(적용 캐릭터 id), voice.enabled(소리 읽기),
chat.fast(빠른 답, 없으면 true), chat.autoThink(계산·추론 질문 자동 생각, 없으면 true).
외부 전송 미션 content에 적용 캐릭터가 있으면 character: {name, persona}를 함께 저장(승인 당시 말투 그대로 전송).
