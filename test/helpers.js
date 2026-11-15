import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 검사마다 임시 폴더에 DB를 만든다. 프로젝트 data/는 건드리지 않는다.
// Windows는 열린 DB 파일을 지울 수 없으므로, 각 검사의 DB가 닫힌 뒤인 프로세스 종료 때 지운다.
const dirs = [];
process.on('exit', () => {
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* 남은 임시 폴더는 무시 */ }
  }
});

// 키 모양 시험 값. 소스에 진짜 키처럼 보이는 글을 두지 않으려고 실행할 때 만든다(비밀 검사기 오탐 방지).
// 예: fakeKey('sk-proj') → "sk-proj-" 뒤에 testonlyfake와 x를 붙인 24자. 가렸는지는 FAKE_KEY_MARK가 남았는지로 본다.
export const FAKE_KEY_MARK = 'testonlyfake';
export function fakeKey(prefix = 'sk', length = 24) {
  return `${prefix}-${FAKE_KEY_MARK.padEnd(length, 'x')}`;
}

export function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-test-'));
  dirs.push(dir);
  return join(dir, 'jarvis.db');
}
