# Research: 1단계 잠정 기술 선택

원본 MASTER_SPEC.md 미확보. 아래는 현재 폴더 자료와 이번 요청만으로 정한 잠정안이다.

## 언어·런타임
- Decision: Node.js 24, JavaScript ESM, 외부 패키지 없음.
- Rationale: 이 PC에 Node 24.19.0이 이미 있다(plan 기존 기록, `node --version` 재확인). macOS에서도 같은 코드가 돈다.
  패키지 설치가 없어 공급망 위험과 설정이 적다. 이후 Electron·Tauri 등 데스크톱 셸에 붙이기 쉽다.
- Alternatives: Python 3.11(설치됨, sqlite3 안정적이나 데스크톱 UI 연결이 덜 직접적), .NET(미설치), Swift(Mac 전용, Windows 검사 불가).

## 저장 방식
- Decision: 내장 `node:sqlite`(SQLite 3.53.3 확인)로 파일 1개. WAL, busy_timeout 5초.
- Rationale: 트랜잭션·조건부 UPDATE로 "정확히 한 번 실행"을 프로세스 사이에서도 보장할 수 있다. 재시작 복원이 자연스럽다.
- Alternatives: JSON 파일(동시성·원자성 약함), 외부 SQLite 패키지(의존성 추가).
- 주의: Node 24에서 `node:sqlite`는 안정화 진행 중. 실행 시 경고가 나오면 기록한다.

## 승인 버전
- Decision: 종류·대상·내용·영향을 정렬된 JSON으로 만들어 SHA-256. 승인 시 사용자가 본 버전을 함께 보내야 한다.
- Rationale: 사용자가 본 내용과 실행 내용이 다르면 실행을 막는다.

## 중복 실행 방지
- Decision: `UPDATE ... SET status='running' WHERE id=? AND status='approved' AND approved_version=content_version`의 변경 행 수가 1일 때만 실행.
- Rationale: 같은 프로세스·다른 프로세스 모두에서 한 번만 선점된다.
- 재시작 시 `running`은 `interrupted`로 바꾸고 자동 재실행하지 않는다.

## 공급자 계약
- Decision: `stream(request, {signal})` 비동기 반복자. 조각(`delta`)·끝(`done`) 이벤트, `ProviderError(code)` 분류. 자동 대체 공급자 없음.
- Rationale: 네 공급자의 스트리밍·취소·오류를 같은 모양으로 다룬다. 실제 어댑터는 키·비용 승인 후.

## 비밀 판별
- Decision: 흔한 키 접두사(`sk-`, `sk-ant-`, `xai-`, `ghp_`, `AKIA` 등)와 긴 고엔트로피 토큰을 거부하는 휴리스틱.
- 한계: 완전하지 않다. 원본 정책 확인 후 보강.

## 공급자 HTTP 어댑터 (2단계 준비, 2026-11-13)
- Decision: 외부 패키지 없이 `fetch`로 네 공급자 어댑터를 만들고, 127.0.0.1 가짜 서버로만 검사한다. 외부 주소는 `JARVIS_ALLOW_REMOTE=1` 없이는 차단.
- Rationale: 1단계의 의존성 0 원칙 유지. 실제 API 호출·비용·개인 자료 전송 없이 요청 모양·스트리밍·취소·오류 분류를 확인할 수 있다.
- 형식 근거: Claude는 Claude API 문서(skill 자료)의 SSE 이벤트·헤더·오류 코드. OpenAI·Grok은 Chat Completions SSE 형식, Ollama는 `/api/chat` NDJSON 형식을 기존 지식으로 작성. OpenAI·Grok·Ollama는 공식 문서와 대조하지 않았다.
- 제안(미반영): 실제 연결을 승인할 때 Claude는 공식 `@anthropic-ai/sdk` 사용을 검토한다(형식 변경 대응, 재시도, 타입 오류 클래스). 의존성 추가가 필요해 지금은 반영하지 않았다.

## 음성 입력(STT) 엔진 검토 (2026-11-14)

결정(2026-11-14, 사용자 다운로드·녹음 허용): 받아쓰기는 아래 추천 1(whisper.cpp v1.9.2 + `whisper-server`)로 정했고 Windows에 설치했다(T209·T212).
마이크 입력은 추천 2(ffmpeg) 대신 **브라우저 마이크 녹음**으로 바꿨다. 화면이 이미 브라우저라 두 OS에서 같은 코드로 되고, 권한 묻기·장치 선택을 브라우저가 맡기 때문이다(T215).
녹음은 화면에서 16kHz WAV로 만들어 보내고(T232), 발화 감지는 추천 3처럼 소리 크기 기준을 JS로 구현했다. ffmpeg는 음성 파일 형식 바꾸기에만 쓴다.
아래 표와 추천은 결정 전 검토 기록이다(설치·다운로드·녹음 전 작성).

조건: 한국어, 이 기기 안에서 처리(음성 외부 전송 없음, 헌법 III), Windows(이 PC: RTX 4090 24GB, Ryzen 9800X3D)와 Mac(M1 Max) 둘 다,
끼어들기를 위한 발화 감지, 의존성 최소. 이 Windows PC에는 내장 한국어 인식기가 없음(T201).

| 후보 | 라이선스 | Windows | Mac(M1 Max) | 한국어 | 붙이는 방법 | 확인한 출처 |
| --- | --- | --- | --- | --- | --- | --- |
| whisper.cpp | MIT | CUDA·Vulkan 가속 빌드, MSVC/MinGW | Metal·Core ML 가속(우선 대상) | 다국어 모델(large-v3-turbo 등). README에 한국어 수치는 없음 | `whisper-server`(HTTP, OpenAI 비슷한 API)를 127.0.0.1에서 실행 → Node가 HTTP로 호출(npm 의존성 없음) | github.com/ggml-org/whisper.cpp (최신 v1.9.5, Windows 배포 파일 이름은 확인 못 함) |
| sherpa-onnx | Apache-2.0 | 미리 빌드한 라이브러리, NVIDIA 빌드 | 지원 | 스트리밍 모델 `sherpa-onnx-streaming-zipformer-korean-2024-06-16` | Node 애드온 `sherpa-onnx-node`(npm 네이티브 의존성 추가), Silero VAD 포함 | k2-fsa.github.io/sherpa/onnx, github.com/k2-fsa/sherpa-onnx |
| faster-whisper | MIT | CUDA 12·cuDNN 9 | Metal 언급 없음(CPU) | Whisper 다국어 | 파이썬 환경 필요 | github.com/SYSTRAN/faster-whisper |
| Vosk | 모델 Apache-2.0 | 지원 | 지원 | `vosk-model-small-ko-0.22`, 82MB, WER 28.1% | 가볍지만 정확도 낮음 | alphacephei.com/vosk/models |
| OS 내장 | — | 이 PC에 한국어 인식기 없음 | macOS 기기 내 한국어 인식은 미확인 | — | OS마다 다른 코드 | T201 |
| 클라우드 STT | — | — | — | — | 음성 외부 전송 → 매번 FR-010a 승인 필요 | 기본안에서 제외 |

추천(잠정):
1. 받아쓰기: **whisper.cpp + `whisper-server`**. 두 OS 모두 GPU 가속(4090 CUDA, M1 Metal), MIT, 지금 구조(외부 패키지 없이 HTTP로 공급자 연결)와 맞음.
2. 마이크 입력: 이 PC에 있는 **ffmpeg**로 받아 Node로 넘김(Windows dshow, macOS avfoundation). Node에는 내장 녹음 기능이 없음.
3. 발화 감지(끼어들기): 처음엔 소리 크기 기준을 JS로 직접 구현, 부족하면 Silero VAD.
4. 대안: 말하는 도중 글이 실시간으로 나와야 하면 **sherpa-onnx 한국어 스트리밍**(npm 네이티브 의존성 추가 결정 필요).

진행에 필요한 승인: ① whisper.cpp 실행 파일·모델 다운로드(대상·크기 확인 후), ② 마이크 녹음 시험, ③ 의존성 정책(npm 네이티브 모듈 허용 여부, 2안일 때만).
예상 효과는 미측정: 받아쓰기 시간은 설치 뒤 두 기기에서 실측한다(scripts/latency-check.js 확장).

### whisper.cpp 다운로드 대상 확인 (2026-11-14, GitHub API·Hugging Face API로 이름·크기·체크섬만 읽음, 다운로드 안 함)

- 최신 안정판 v1.9.5(2026-10-06)는 미리 빌드한 파일이 없음. 같은 날 시험판 b5454에만 있음.
- 추천: 미리 빌드한 파일이 있는 최근 안정판 **v1.9.2(2026-08-04)**.

| 용도 | 파일 | 크기 | sha256 | 출처 |
| --- | --- | --- | --- | --- |
| Windows 실행 파일(CUDA 12.4, RTX 4090용) | whisper-cublas-12.4.0-bin-x64.zip | 670.6MB | 443110ddaad70d4290ab2e77179e31cf712035bbc4fad56bb4519a90c917b39c | github.com/ggml-org/whisper.cpp releases v1.9.2 |
| (대안) Windows CPU 전용 | whisper-bin-x64.zip | 8.2MB | 49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a | 같은 곳 |
| 받아쓰기 모델(추천, 작음) | ggml-large-v3-turbo-q5_0.bin | 574MB | 394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2 | huggingface.co/ggerganov/whisper.cpp |
| (대안) 정확도 우선 | ggml-large-v3-turbo-q8_0.bin | 874MB | 317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1 | 같은 곳 |
| 발화 감지 모델 | ggml-silero-v6.2.0.bin | 0.9MB | 2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987 | huggingface.co/ggml-org/whisper-vad |

- Windows 합계(추천안): 약 1.25GB. 그래픽 드라이버 610.88은 CUDA 12.4 실행 가능 범위.
- 받을 곳(프로젝트 안, 공유 제외): `tools/whisper/`(실행 파일), `tools/whisper/models/`(모델). 받은 뒤 sha256 대조, 압축 경로가 폴더 밖을 가리키지 않는지 확인 후 별도 폴더에 해제.
- macOS: Homebrew `whisper.cpp` 공식 공식(formula) v1.9.5, MIT, 의존 ggml·llama.cpp·sdl2-compat. 시험 명령은 `whisper-cli`.
  `whisper-server`가 함께 설치되는지는 공식 파일에서 확인 못 함 → Mac에서 확인. 모델 파일은 Windows와 같음.
- 확인 못 한 것: zip 안에 `whisper-server.exe`와 CUDA 실행 DLL이 들어 있는지(크기상 DLL 포함 추정), 한국어 정확도·속도.

### whisper.cpp 설치·실측 (2026-11-14, 사용자 다운로드 허용 후, 마이크·소리·외부 전송 없음)

- 받은 파일 3개 sha256 모두 기록값과 일치. zip 항목 44개, 위험 경로 0개. `tools/whisper/v1.9.2/`(새 폴더)에 해제. `whisper-server.exe`·CUDA DLL 포함 확인.
- `whisper-cli`(CUDA, RTX 4090 인식): "안녕하세요. 내일 오후 3시에 회의 일정을 잡아주세요." 정확. "자비스"는 "차비스"로 오인식.
- `whisper-server`(127.0.0.1만 열림) 결함 발견: **한글 프롬프트(--prompt "자비스")를 주면 응답의 한글이 깨짐**("후" → U+FFFD). 옵션 없는 서버·영문 프롬프트에서는 정상 → 원인 확정.
- **영문 프롬프트 "JARVIS"**: 글자 깨짐 없음 + "자비스"를 정확히 인식.
- **VAD(silero v6.2.0)**: 켜면 3초 무음에서 빈 글(11ms). 끄면 무음에서 "RVIS"를 지어냄 → VAD 켬 필수.
- 받아쓰기 시간(준비 뒤): 4.7초 음성 0.2~0.3초, 짧은 음성 0.06초.
- `whisper-server`는 다른 Host 머리글 요청도 받음(200) → JARVIS에 붙일 때 서버를 JARVIS가 직접 띄우고 임의 포트·짧은 수명으로만 쓰거나 앞단에서 막아야 함(DNS 리바인딩 대비).
- 결정(잠정): whisper.cpp v1.9.2 + large-v3-turbo-q5_0 + Silero VAD 켬 + 영문 프롬프트 "JARVIS".

### 이름 받아쓰기 개선 (2026-11-14)
- 영문 프롬프트 4가지 비교: "JARVIS" 8/10이 가장 좋음(없음 6/10, 긴 문장 프롬프트 7/10). 프롬프트만으로는 개선 한계.
- 결정: 받아 적은 뒤 실측 오인식(차비스·쟈비스·짜비스·재비스·자비쓰, Jarvis·Javis·Chavis·Charvis·Jabis)만 "자비스"로 바로잡음. 원래 글은 rawText로 함께 돌려줌.
- 결과: 기존 문장 8/10 → 10/10, 새 문장 10/10 유지. 합성 음성 기준.

### 빠른 답 품질 비교 (2026-11-14, Windows, gemma4:12b)
- 쉬운 문제 20문항: 생각함 20/20(7.7초), 빠른 답 20/20(0.4초).
- 어려운 문제 20문항: 생각함 20/20(6.1초), 빠른 답 18/20(0.7초). 오답은 같은 다단계 계산 문제(4×7을 20으로 계산).
- 제안(미반영, T224): 계산·추론으로 보이는 질문만 자동으로 생각함으로 보내는 방식. 결정은 사용자.

### 자동 생각 전환 (2026-11-14)
- 단순 규칙(계산식·계산 낱말+숫자·추론 낱말·숫자와 수량 질문·숫자 비교)으로 판단. 결과: 어려운·새 계산 문제 정확도는 생각함과 같고(20/20), 일상 대화는 빠른 답 속도(0.31초) 유지.
- 대안(미반영): 작은 분류 모델로 판단 — 더 정확할 수 있으나 지연·복잡도 증가.
