# CLI Contract (1단계)

`node src/cli.js [--db 경로] <영역> <명령> [인자]` — 출력은 JSON 한 줄. 실패 시 종료 코드 1과 `{"error":{"code","message"}}`.
기본 DB: `data/jarvis.db` (환경 변수 `JARVIS_DB`로 변경).

## mission
- `create --kind K --title T --target X --impact I --content JSON`
- `list [--status S]`, `show ID`
- `approve ID --version V` (V는 show로 본 content_version)
- `reject ID`, `cancel ID`
- `update ID --content JSON [--target X] [--impact I] [--title T]`
- `run ID`

## memory
- `add TEXT [--tags a,b]`, `list`, `get ID`, `search TEXT`
- `update ID TEXT [--tags a,b]`, `delete ID`

## quick
- `list`, `run NAME [--param k=v ...]` → pending 미션 생성. 실행은 `mission approve` + `mission run`.

## chat (잠정, FR-010a)
- `ask --provider P [--memory 1,2] TEXT`
  - 로컬 공급자 또는 기억 없음 → 바로 보냄: `{"status":"sent","reply":...}`
  - 외부 공급자 + 기억 → 보내지 않고 미션 생성: `{"status":"approval_required","mission":...,"preview":...}`
  - 이후 `mission approve ID --version V` + `mission run ID`. 결과 답은 미션 result에 저장.
- `mission show ID`는 전송 미션이면 `preview`(실제로 보낼 메시지)를 함께 보인다.
- 공급자는 환경 변수와 `.env.local`을 읽는다. 외부 주소는 `JARVIS_ALLOW_REMOTE=1`도 있어야 실제로 나간다.

## quick 검색 (2026-11-14, FR-007a)
- `quick run memory-search --param q=검색어`, `quick run meeting-search --param q=검색어` → pending 미션. 승인·실행은 다른 미션과 같다. 결과는 번호만(원문 없음).

## db (2026-11-14, T163)
- `compact`: 옛 DB(secure_delete를 켜기 전에 만든 DB)의 빈 공간에 남은 지운 자료 원문을 없앤다(VACUUM + WAL 비우기). JARVIS를 끈 뒤 실행한다.
  - 응답 `{db, before:{pages,freePages,bytes}, after:{...}, walBytes, clean}`. 다른 프로그램이 DB를 쓰는 중이면 `clean:false`와 `hint`, 또는 `invalid_state`.
  - DB 파일이 없으면 만들지 않고 `not_found`. DB 크기만큼 빈 디스크 공간이 더 필요하다.

오류 코드: not_found, approval_required, version_mismatch, invalid_state, rejected_secret, invalid_input, unknown_executor, memory_changed.
