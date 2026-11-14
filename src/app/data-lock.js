// 데이터 폴더 잠금(2026-11-14 독립 QA 결함). Windows·macOS 공통.
// 같은 데이터 폴더로 JARVIS를 두 번 켜면, 두 번째가 시작 복원(실행 중 → 중단, 녹음 중 → 중단)으로
// 아직 돌고 있는 첫 번째의 기록을 망가뜨렸다(포트 충돌로 곧 꺼져도). DB를 열기 전에 잠금을 잡아 막는다.
//
// 잠금은 OS가 보장하는 파일 잠금을 쓴다: 따로 둔 SQLite 파일(jarvis.lock.db)에 연결을 열고 BEGIN EXCLUSIVE를
// 프로세스가 사는 동안 쥔다. 잡기는 한 번에 끝나고(만드는 중 빈 틈 없음), 프로세스가 강제 종료돼도 OS가 풀어 준다.
// (처음 만든 PID 파일 방식은 파일을 만들고 PID를 쓰기 전 빈 파일 틈에 다른 실행이 잠금을 넘겨받는 결함이 있었다.)
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { AppError } from '../errors.js';

export const LOCK_NAME = 'jarvis.lock.db';

export function acquireDataLock(dataDir) {
  const file = join(dataDir, LOCK_NAME);
  const db = new DatabaseSync(file);
  try {
    // 기다림 0이면 동시에 켠 실행들이 모두 공유 잠금을 쥔 채 서로 때문에 배타 잠금을 못 얻고 다 같이 포기했다
    // (동시 시작 50회 중 2~3회 아무도 시작 못 함, 2026-11-14 독립 QA). 잠깐 기다리게 하면 SQLite가 교착 쪽은 바로
    // 물러나게 하고 남은 하나가 잡는다. 이미 쥔 실행이 있으면 최대 2초 기다린 뒤 거부한다.
    db.exec('PRAGMA busy_timeout = 2000');
    db.exec('BEGIN EXCLUSIVE');
  } catch (e) {
    db.close();
    if (e.errcode === 5 || /locked|busy/i.test(e.message)) {
      throw new AppError('data_in_use', `이 데이터 폴더를 다른 JARVIS가 쓰는 중. 그 JARVIS를 끄거나 --data로 다른 폴더를 주세요. (${file})`);
    }
    throw e;
  }
  let released = false;
  return {
    file,
    release() {
      if (released) return;
      released = true;
      try { db.exec('ROLLBACK'); } catch { /* 이미 끝남 */ }
      db.close();
    },
  };
}
