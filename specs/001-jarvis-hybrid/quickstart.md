# Quickstart (1단계 검증)

전제: Node.js 24 이상. 설치할 패키지 없음.

```sh
npm test                 # 전체 자동 검사
npm start                # 화면 서버를 켜고 브라우저로 http://127.0.0.1:4780/ 열기 (Windows: start-jarvis.cmd)
node src/cli.js quick list
node src/cli.js quick run echo --param text=안녕
node src/cli.js mission show 1          # content_version 확인
node src/cli.js mission run 1           # 승인 전 → approval_required
node src/cli.js mission approve 1 --version <버전>
node src/cli.js mission run 1           # done
node src/cli.js mission run 1           # invalid_state (중복 실행 없음)
node src/cli.js memory add "커피는 아메리카노" --tags 취향
node src/cli.js memory search 커피
```

기대 결과는 [contracts/cli.md](contracts/cli.md)와 spec의 승인 시나리오를 따른다.
화면 확인: 승인 대기·빠른 작업·대화·기억·회의·캐릭터 탭. 화면 API는 [contracts/http.md](contracts/http.md).
수동 실제 검사: `node scripts/ollama-smoke.js <모델>`, `node scripts/tts-smoke.js <폴더>`, `node scripts/cloud-smoke.js claude openai`(계획만, `--yes-send` 때 전송).
받아쓰기(소리·마이크 없음): `node scripts/stt-smoke.js <임시 폴더> --server … --model …`(README 참고). 화면에서는 대화 탭 "음성 파일로 질문 넣기", 회의 탭 "회의 음성 파일 가져오기".
마이크(마이크 연결 필요): 대화 탭 "말하기"·"듣기 모드", 회의 탭 "마이크로 회의 녹음 시작". 이 PC에서는 가짜 마이크로만 확인했다.
옛 DB 정리: JARVIS를 끈 뒤 `node src/cli.js db compact`, 결과 `clean:true`.
자동 검사는 모의·로컬 검사이며 Mac·클라우드 API 검증이 아니다.
