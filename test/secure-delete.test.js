// 헌법 III "삭제는 실제 저장소에서 지운다" 검사.
// 지우거나 고친 개인 자료의 원문 바이트가 DB 파일·WAL 파일에 남지 않는지 직접 읽어 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDb } from '../src/store/db.js';
import { Settings } from '../src/store/settings.js';
import { MemoryStore } from '../src/memory/memory.js';
import { CharacterStore } from '../src/character/characters.js';
import { MeetingStore } from '../src/meeting/meetings.js';
import { tempDbPath } from './helpers.js';

function leftover(path, text) {
  const needle = Buffer.from(text, 'utf8');
  return [path, `${path}-wal`].filter((p) => existsSync(p) && readFileSync(p).includes(needle));
}

function open(t) {
  const path = tempDbPath();
  const db = openDb(path);
  t.after(() => { try { db.close(); } catch { /* 이미 닫힘 */ } });
  return { db, path };
}

test('지운 기억의 원문이 DB·WAL 파일에 남지 않는다 (열린 상태와 닫은 뒤)', (t) => {
  const { db, path } = open(t);
  const mem = new MemoryStore(db);
  const keep = mem.add('남겨 둘 기억 KEEP1');
  const gone = mem.add('지울 비밀 메모 QZXJ1');
  mem.delete(gone.id);
  assert.deepEqual(leftover(path, 'QZXJ1'), []);
  assert.equal(leftover(path, 'KEEP1').length > 0, true, '남긴 기억은 파일에 있어야 함');
  db.close();
  assert.deepEqual(leftover(path, 'QZXJ1'), []);
  assert.equal(mem.constructor.name, 'MemoryStore');
  assert.ok(keep.id);
});

test('고친 기억의 옛 원문도 파일에 남지 않는다', (t) => {
  const { db, path } = open(t);
  const mem = new MemoryStore(db);
  const a = mem.add('예전 내용 OLDV2');
  mem.update(a.id, '새 내용 NEWV2');
  assert.deepEqual(leftover(path, 'OLDV2'), []);
  assert.ok(leftover(path, 'NEWV2').length > 0);
});

test('지운 캐릭터의 말투와 자산 정보가 파일에 남지 않는다', (t) => {
  const { db, path } = open(t);
  const chars = new CharacterStore(db, new Settings(db));
  const c = chars.create({ name: '지울캐릭 CHR3', persona: '비밀 말투 PSN3', assets: [{ name: 'AST3', source: 'SRC3', license: 'LIC3' }] });
  chars.delete(c.id);
  for (const s of ['CHR3', 'PSN3', 'AST3', 'SRC3', 'LIC3']) assert.deepEqual(leftover(path, s), [], s);
});

test('지운 회의 녹취가 파일에 남지 않는다', (t) => {
  const { db, path } = open(t);
  const meetings = new MeetingStore(db, { audioDir: join(dirname(path), 'meetings') });
  const a = meetings.start('회의 MTG4');
  meetings.addSegment(a.id, { startMs: 0, endMs: 1000, text: '녹취만 지움 TRN4' });
  meetings.stop(a.id, 2000);
  meetings.deleteTranscript(a.id);
  assert.deepEqual(leftover(path, 'TRN4'), []);
  const b = meetings.start('전체 지움 MTG5');
  meetings.addSegment(b.id, { startMs: 0, endMs: 1000, text: '전체 지움 TRN5' });
  meetings.stop(b.id, 2000);
  meetings.delete(b.id);
  for (const s of ['MTG5', 'TRN5']) assert.deepEqual(leftover(path, s), [], s);
});
