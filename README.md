# JARVIS Hybrid 2.0

2026-11-13. 맥북과 Windows PC에서 각각 따로 실행한다(기기 간 연결·동기화 없음, 사용자 결정).
기억·작업 기록은 그 기기의 `data/` 폴더에만 저장된다.

- 화면: 브라우저로 여는 로컬 화면. 그 기기 안(127.0.0.1)에서만 열리고, 실행마다 새 토큰이 있어야 API를 쓸 수 있다.
- 자비스 모드(`/jarvis`): 캐릭터 얼굴과 대화만 크게 보이는 화면. "장치 점검"으로 그 기기의 화면·터치·네트워크·마이크·카메라·스피커·센서를 확인한다. 관리 화면은 "설정 모드"(`/`).
- 다른 기기(휴대폰·태블릿)에서 쓰기: `node src/main.js --host <이 PC 와이파이 주소>` → `http://<주소>:<포트>/jarvis`. 같은 와이파이의 누구나 열 수 있으니 집 와이파이에서만. 이 연결에서는 말하기·마이크·카메라가 막힌다(보안 연결 필요).
- 구현: 승인 대기 작업(Mission Control), 빠른 작업, 기억, 대화(공급자 선택), 회의 기록 보기·삭제, 끼어들기 로직, 회의 시간 규칙.
- 잠정: 기억을 외부 공급자로 보내는 대화는 승인 뒤에만 보낸다.
- 스택: Node.js 24 내장 기능만(외부 패키지 없음), 로컬 SQLite 파일. 근거는 `specs/001-jarvis-hybrid/research.md`.
- 원본 ZIP과 MASTER_SPEC.md는 아직 확보하지 못했다. 현재 문서는 이번 요청으로 작성한 초안이며 원본을 대체하지 않는다.
- 검사한 곳: Windows 11에서 자동 검사와 화면 실제 실행. macOS에서는 아직 실행하지 않았다.
- 음성 출력: OS 내장 음성 합성(Windows System.Speech, macOS say). Windows 한국어 음성으로 WAV 합성까지 확인.
  `node scripts/tts-smoke.js <폴더>`(파일만), `--speak`를 붙이면 스피커로 한 문장 말한다.
- 캐릭터 탭: 이름·성격·말투·목소리·자산(출처·이용 조건)을 저장하고 적용한다. 적용하면 대화 말투와 읽는 목소리가 바뀐다.
- 화면 대화 탭의 "말하기": 브라우저로 마이크 녹음 → 이 기기 안에서 받아쓰기 → 질문 칸(녹음 시작 시 읽던 답을 멈춤). "듣기 모드"는 말소리를 감지하면 자동 녹음. JARVIS가 말하는 중이면 들린 말을 먼저 받아 적어, 방금 읽은 답과 같으면(스피커 소리) 무시하고 다르면 멈춘다. 듣기 모드는 말머리가 잘리지 않게 말 시작 전 0.8초도 함께 담는다. 녹음은 저장하지 않는다.
- 화면 대화 탭의 "음성 파일로 질문 넣기": 음성 파일을 이 기기 안의 whisper.cpp로 받아 적어 질문 칸에 넣는다(Windows는 tools/whisper, macOS는 brew whisper.cpp, 환경 변수 JARVIS_WHISPER_SERVER·JARVIS_WHISPER_MODEL·JARVIS_WHISPER_VAD로 바꿈).
- 회의 탭의 "마이크로 회의 녹음 시작": 녹음하며 15~30초마다 이 기기 안에서 받아 적어 회의록을 쌓고, 원음은 이 기기에만 바로바로 저장한다. 화면이 꺼져 끊긴 녹음은 "끊긴 녹음 마무리"로 끝낸다.
- 회의 탭의 "회의록 검색": 회의 제목·녹취 글을 찾고 시간 구간을 보인다. 시간을 누르면 그 위치부터 재생한다.
- 빠른 작업 "memory-search"·"meeting-search": 승인한 뒤에만 이 기기 안에서 찾는다. 결과에는 번호만 남는다.
- 캐릭터 얼굴: 도형으로 그린 단순한 오리지널 얼굴(모양·색·눈). 대기·듣기·생각·말하기 상태를 보이고, 말할 때 입이 일정한 박자로 움직인다(소리에 맞춘 립싱크 아님, 원본 그림 확인 전 잠정안).
- 회의 탭의 "회의 음성 파일 가져오기": 음성 파일을 이 기기 안에서 시간 구간별로 받아 적고, 원음은 이 기기에만 저장한다. 시간을 누르면 그 위치부터 재생한다.
- 화면 대화 탭에서 "답을 이 기기 스피커로 읽기"를 켜면 답을 소리로 읽는다(기본 꺼짐). "말 멈추기"로 끊는다.
- 아직 확인 못 함: 실제 마이크(이 PC에 없음, 가짜 마이크로만 확인), 클라우드 API 정상 호출, 맥 실기 확인. 화면 API는 `specs/001-jarvis-hybrid/contracts/http.md`.
- GitHub 저장소 생성, 커밋, 푸시, PR은 하지 않았다.

## 설치

두 기기 모두 Node.js 24 이상만 있으면 된다. 설치할 패키지는 없다.
이 프로젝트 폴더를 각 기기에 복사한다(`data/`, `.env.local` 제외).

## 실행

| 기기 | 방법 |
| --- | --- |
| Windows | `start-jarvis.cmd`를 두 번 클릭, 또는 터미널에서 `npm start` |
| macOS | 처음 한 번 `chmod +x start-jarvis.command` 후 두 번 클릭, 또는 터미널에서 `npm start` |

`npm start`는 서버를 켜고 기본 브라우저로 `http://127.0.0.1:4780/`을 연다. 끄려면 터미널에서 Ctrl+C.
옵션: `node src/main.js --port 4781 --data 다른폴더` (브라우저 자동 열기는 `--open`).

## 검사와 명령

```sh
npm test
npm run cli -- quick list
npm run cli -- memory add "커피는 아메리카노" --tags 취향
```

명령 전체는 `specs/001-jarvis-hybrid/contracts/cli.md`, 검증 순서는 `specs/001-jarvis-hybrid/quickstart.md`.

- Ollama 실제 검사: `node scripts/ollama-smoke.js <모델>`
- 지연 측정(두 OS 공통, 소리 없음): `node scripts/latency-check.js <임시 폴더> --model <모델> --runs 3`
- 받아쓰기 확인(whisper.cpp, 소리·마이크 없음): `node scripts/stt-smoke.js <임시 폴더> --server tools/whisper/v1.9.2/Release/whisper-server.exe --model tools/whisper/models/ggml-large-v3-turbo-q5_0.bin --vad-model tools/whisper/models/ggml-silero-v6.2.0.bin`
- 옛 DB 정리(2026-11-13 이전에 만든 DB): JARVIS를 끈 뒤 `npm run cli -- db compact`, 결과 `clean:true` 확인
- 클라우드 검사: `.env.local`에 키를 넣고 `node scripts/cloud-smoke.js claude openai`로 계획 확인 후 `--yes-send`

## 구조

`src/`(app, server, store, security, mission, quick, memory, providers, conversation, meeting, cli.js, main.js),
`test/`(node:test 검사), `scripts/`(실제 공급자 수동 검사).
문서: `.specify/memory/constitution.md`, `specs/001-jarvis-hybrid/`, `BLOCKERS.md`.

Spec Kit이 필요하면 같은 커밋을 설치한다:

```sh
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@2ee2b1e8005905db05f5717300a469b3068b908f
```

원본 ZIP은 별도 폴더에 풀어 비교하며 일괄 덮어쓰지 않는다.
