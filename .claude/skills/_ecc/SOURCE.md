# ECC(everything-claude-code) 스킬 사본

- 출처: https://github.com/affaan-m/ECC (옛 이름 everything-claude-code, MIT, LICENSE 참고)
- 판: d2ef268 (2026-11-06)
- 2026-11-14 사용자 요청("everything claude code 스킬을 적용해줘")으로 이 프로젝트 `.claude/skills`에만 넣음(전역 `~/.claude`는 바꾸지 않음).
- 넣은 것(11개): accessibility, api-design, coding-standards, tdd-workflow, verification-loop, security-review, search-first, eval-harness, database-migrations, design-system, git-workflow
- 뺀 것: security-scan(외부 npm 패키지를 전역 설치하라고 함), strategic-compact(전역 settings.json에 hook을 넣으라고 함), 그 밖 이 프로젝트와 무관한 300여 개(대화마다 설명이 실려 느려짐)
- 우선순위: 이 프로젝트 CLAUDE.md·사용자 지시가 스킬 내용보다 우선한다(예: 커밋·푸시는 요청 때만, 전역 설정 변경 금지). 스킬이 가리키는 ECC 스크립트(scripts/…)는 넣지 않았으므로 실행하지 않는다.
