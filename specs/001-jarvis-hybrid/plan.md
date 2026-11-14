# Implementation Plan: JARVIS Hybrid 2.0

**Branch**: `001-jarvis-hybrid` (git 없음) | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)
**Status**: 1단계 잠정 계획. 원본 MASTER_SPEC.md와 기술 스택 대조 전.

## Summary

Windows에서 검사할 수 있는 부분을 먼저 만들었다: Mission Control 승인, Quick Actions, 기억, 공급자 어댑터(외부 기본 차단),
개인 자료 전송 승인, 끼어들기 로직, 음성 출력, 마이크 입력·로컬 받아쓰기(whisper.cpp)·에코 대책, 빠른 답·자동 생각,
회의 시간·삭제 규칙·파일 가져오기·마이크 녹음, 캐릭터 설정, 두 OS 공통 로컬 화면, 옛 DB 정리 명령.
마이크 기능은 이 PC에 마이크가 없어 가짜 마이크로만 확인했다. 실제 마이크·클라우드 실제 호출·macOS 실기·시각 캐릭터·토스 프론트는 기기·키·Mac·원본 확보 후 진행한다.

## Technical Context

**Language/Version**: JavaScript(ESM), Node.js 24 (Windows에서 24.19.0 확인) — 잠정
**Primary Dependencies**: npm 패키지 없음. Node 내장 `node:sqlite`, `node:crypto`, `node:test`, `node:http`만 사용.
실행 도구(2026-11-14 사용자 다운로드 허용): whisper.cpp v1.9.2 `whisper-server`와 모델(large-v3-turbo-q5_0, Silero VAD)을 `tools/whisper/`에 두고 JARVIS가 127.0.0.1 임의 포트로 띄워 HTTP로 부른다(약 2.3GB, 공유 제외). macOS는 brew whisper.cpp(미검증, T213). 음성 형식 바꾸기는 ffmpeg(설치된 것 사용). 선택 근거는 research.md "음성 입력(STT) 엔진 검토"
**Storage**: 로컬 SQLite 파일 1개 (`data/jarvis.db`, WAL, busy_timeout)
**Testing**: `node --test` (단위·재시작 복원·다중 프로세스 중복 실행 검사)
**Target Platform**: macOS(M1 Max)와 Windows PC 각각 단독 실행 (2026-11-13 사용자 결정). 기억·작업 기록은 기기마다 따로, 동기화 없음
**Project Type**: 로컬 단일 사용자 앱. 코어 라이브러리 + CLI + 로컬 웹 화면(127.0.0.1 전용 Node 서버, 브라우저로 염). 음성 입출력은 OS별 계층으로 나중에 붙임
**Performance Goals**: 수치 목표 없음. 음성 지연 목표는 Mac·Windows 각각 실측 후 확정(scripts/latency-check.js)
**Constraints**: 외부 주소 전송은 기본 차단(JARVIS_ALLOW_REMOTE=1과 승인 필요), 화면 서버는 127.0.0.1 전용, 비밀 값 저장 금지, 지운 자료는 파일에서도 지움(secure_delete·WAL 비우기), 프로젝트 폴더 밖 쓰기 금지
**Scale/Scope**: 사용자 1명, 미션·기억 수천 건 수준

선택 근거와 대안은 [research.md](research.md)에 있다.

## Constitution Check

| 원칙 | 1단계 적용 | 상태 |
| --- | --- | --- |
| I 사용자 통제 | 승인은 내용 버전 해시에 연결, 조건부 갱신으로 1회 실행, Quick Action도 미션 경유 | 통과 |
| II 한국어 대화 | 듣기·생각·말하기 상태 구분, 끼어들기 시 생성·재생 함께 중단·오래된 답 폐기, 에코 대책. Windows 합성 음성·가짜 마이크로 검사 | 일부 통과. 실제 청취·실제 마이크·Mac 지연은 남음(T148·T218·T204) |
| III 개인 자료 | 로컬 저장만, 비밀 형태 값 거부, 실제 삭제, 자동 공급자 전환 없음 | 통과 |
| IV 증거 | 자동 검사 결과를 tasks.md에 기록, 모의 검사임을 표시 | 통과 |
| V 범위·원본 | 프로젝트 폴더 안만 사용, 원본 미확보 명시, 잠정 스택 재검토 조건 기록 | 통과 |

설계 후 재검사(2026-11-14 다시 봄): npm 의존성 없음. 외부 실행 도구는 whisper.cpp·ffmpeg뿐이고 이 기기 안(127.0.0.1)에서만 쓰며 음성을 밖으로 보내지 않는다. 외부 네트워크는 사용자가 키를 넣고 허용한 공급자 호출뿐. 위반 없음.

## 단계

1. 완료: 코어(승인·기억·빠른 작업), 공급자 어댑터와 형식 대조, 로컬 Ollama 실제 검사, 전송 승인, 끼어들기 로직,
   음성 출력(Windows 합성 확인), 회의 규칙, 캐릭터 설정, 로컬 화면, 삭제 자료 파일 정리,
   마이크 입력·받아쓰기·에코 대책·녹음 앞부분 미리 담기, 빠른 답·자동 생각, 회의 파일 가져오기·마이크 녹음, 옛 DB 정리(모두 Windows, 마이크는 가짜).
   2026-11-14 묶음(Phase 20): 계산 판단 4차(T241), 회의록 검색(T242), 검색 Quick Action(T244, 결과는 번호만 저장),
   회의 조각 순서 번호·중복 방지(T246, `?seq=`), 회의 삭제 뒤 화면 원음 정리(T248), 캐릭터 도형 얼굴·상태·입 박자(T249~T251, `public/avatar.js`, characters.look 열).
2. 원본 확보 후 해시·구조·요구 차이 기록, 스택·잠정 정책 재검토, 토스 프론트 대상 식별.
3. 키 확보 후 클라우드 공급자 실제 검사(scripts/cloud-smoke.js).
4. 마이크를 연결한 뒤 실제 말하기·듣기 모드·끼어들기·에코·회의 녹음 확인(Windows·macOS 각각). 지연 실측은 Windows(이 PC)와 Mac 각각, 그 뒤 성능 기준 확정.
5. 실제 청취, 캐릭터 시각 요소, 토스 프론트 실기, 전체 QA.

## Project Structure

### Documentation (this feature)

```text
specs/001-jarvis-hybrid/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
├── contracts/ (cli.md, provider.md, http.md)
└── checklists/requirements.md
```

### Source Code (repository root)

```text
package.json            # 의존성 없음, scripts: test, start(화면), serve, cli
src/
├── app/services.js     # 앱 조립, 시작 시 복원
├── server/             # server.js(127.0.0.1 API), public/index.html(화면), public/voice-input.js(발화 감지·녹음 미리 담기·WAV)
├── store/              # db.js(SQLite·secure_delete·scrub·compactDb), settings.js
├── security/secrets.js # 비밀 형태 판별
├── mission/missions.js # MissionControl: 생성·승인·거절·수정·실행·복원
├── mission/executors.js# 모의·로컬 실행기 (외부 작업 없음)
├── quick/quickActions.js
├── memory/memory.js
├── providers/          # contract.js, mock.js, registry.js, http.js, adapters.js
├── conversation/       # transfer.js(전송 승인·대화), turns.js(끼어들기), reasoning.js(자동 생각 판단)
├── voice/              # sentences.js, player.js, system-speaker.js(Windows·macOS), stt.js(whisper-server), wav.js, echo.js(에코 판단)
├── meeting/            # meetings.js(회의 시간·삭제 규칙·파일 가져오기), live.js(마이크 녹음 조각)
├── character/characters.js
├── main.js             # 화면 실행 진입점
└── cli.js              # 로컬 명령
scripts/                # ollama·cloud·tts·stt·지연·품질 실제 검사(수동)
test/                   # node:test 검사, fixtures/(자동 생각 판단 문제 묶음)
tools/whisper/          # whisper.cpp 실행 파일·모델(다운로드, 공유 제외)
data/                   # 실행 시 생성되는 로컬 DB (배포·공유 제외)
```

**Structure Decision**: 단일 프로젝트. 코어 + CLI + 브라우저로 여는 로컬 화면. 데스크톱 셸(창 앱)은 원본 확인 후 검토.

## Risks

원본 스택과 불일치, `node:sqlite`가 Node 24에서 안정화 단계(Release Candidate)라 경고·변경 가능,
인증, Mac, API 비용·전송 동의, 음성 품질, 오픈소스 이용 조건, 제품명 불명확.
상태와 해제 조건은 BLOCKERS.md에서 관리한다.
