// 옛 DB 정리(T163) 검사. secure_delete를 켜기 전에 만든 DB처럼, 지운 기억의 원문이 빈 페이지에 남은 파일을 만들고
// `cli db compact`가 그 원문을 파일에서 없애는지 바이트로 직접 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openDb, compactDb } from '../src/store/db.js';
import { MemoryStore } from '../src/memory/memory.js';
import { tempDbPath } from './helpers.js';

const pexec = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const SAFE_ENV = { ...process.env, JARVIS_NO_ENV_FILE: '1' };
for (const k of ['JARVIS_ALLOW_REMOTE', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY']) delete SAFE_ENV[k];

async function cli(...args) {
  try {
    const { stdout } = await pexec(process.execPath, [CLI, ...args], { env: SAFE_ENV });
    return { code: 0, out: JSON.parse(stdout) };
  } catch (e) {
    return { code: e.code, out: JSON.parse(e.stdout) };
  }
}

const leftover = (path, text) => [path, `${path}-wal`].filter((p) => existsSync(p) && readFileSync(p).includes(Buffer.from(text, 'utf8')));

// secure_delete 없이 기억을 넣고 일부를 지우거나 고친 "옛 DB"를 만든다.
// (전부 지우면 페이지가 통째로 빠져 원문이 남지 않았다. 같은 페이지에 남은 기억이 있을 때 지운 칸에 원문이 남는다. 2026-11-14 확인)
function makeOldDb() {
  const path = tempDbPath();
  openDb(path).close(); // 지금 스키마
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA secure_delete = OFF;');
  const mem = new MemoryStore(raw);
  mem.add('남겨 둘 기억 KEEPC1');
  const gone = [];
  for (let i = 0; i < 20; i += 1) {
    mem.add(`남은 메모 LIVE${i} ${'나'.repeat(100)}`);
    gone.push(mem.add(`지운 비밀 메모 OLDSECRET${i} ${'가'.repeat(100)}`).id);
  }
  const upd = mem.add('고치기 전 내용 OLDUPD');
  for (const id of gone) mem.delete(id);
  mem.update(upd.id, '고친 내용 NEWUPD');
  raw.close();
  return path;
}

test('옛 DB: 지운 기억의 원문이 남아 있다가 db compact 뒤 파일에서 사라진다', async () => {
  const path = makeOldDb();
  const before = Array.from({ length: 20 }, (_, i) => `OLDSECRET${i} `).filter((s) => leftover(path, s).length);
  assert.ok(before.length > 0, '전제: 옛 DB에는 지운 원문이 남아 있음');
  assert.ok(leftover(path, 'OLDUPD').length > 0, '전제: 고치기 전 원문도 남아 있음');
  const r = await cli('--db', path, 'db', 'compact');
  assert.equal(r.code, 0);
  assert.equal(r.out.clean, true);
  assert.equal(r.out.after.freePages, 0);
  assert.ok(r.out.after.bytes <= r.out.before.bytes);
  for (let i = 0; i < 20; i += 1) assert.deepEqual(leftover(path, `OLDSECRET${i} `), [], `OLDSECRET${i}`);
  assert.deepEqual(leftover(path, 'OLDUPD'), []);
  for (const keep of ['KEEPC1', 'LIVE0 ', 'LIVE19 ', 'NEWUPD']) assert.ok(leftover(path, keep).length > 0, `${keep}는 그대로`);
  const list = await cli('--db', path, 'memory', 'list');
  assert.equal(list.out.length, 22);
  assert.equal(list.out.filter((m) => m.content.includes('OLDSECRET')).length, 0);
});

test('다른 연결이 읽는 중이면 깨끗하다고 하지 않는다', () => {
  const path = makeOldDb();
  const db = openDb(path);
  const other = new DatabaseSync(path);
  other.exec('PRAGMA busy_timeout = 100;');
  other.exec('BEGIN');
  other.prepare('SELECT count(*) FROM memories').get(); // 읽기 잠금 유지
  try {
    let r = null;
    try { r = compactDb(db, path); } catch (e) { assert.equal(e.code, 'invalid_state'); assert.match(e.message, /JARVIS를 끈 뒤/); }
    if (r) { assert.equal(r.clean, false); assert.match(r.hint, /JARVIS를 끈 뒤/); }
  } finally {
    other.exec('COMMIT');
    other.close();
    db.close();
  }
});

test('없는 DB는 새로 만들지 않고 알린다', async () => {
  const path = tempDbPath();
  const r = await cli('--db', path, 'db', 'compact');
  assert.equal(r.code, 1);
  assert.equal(r.out.error.code, 'not_found');
  assert.equal(existsSync(path), false);
});
