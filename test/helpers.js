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

export function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-test-'));
  dirs.push(dir);
  return join(dir, 'jarvis.db');
}
