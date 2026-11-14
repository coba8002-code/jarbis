import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { MemoryStore } from '../src/memory/memory.js';
import { looksLikeSecret } from '../src/security/secrets.js';
import { tempDbPath } from './helpers.js';

function open(t, path) {
  const db = openDb(path);
  t.after(() => { try { db.close(); } catch { /* 이미 닫힘 */ } });
  return { db, mem: new MemoryStore(db) };
}

test('기억 저장·조회·목록·검색', (t) => {
  const { mem } = open(t, tempDbPath(t));
  const a = mem.add('커피는 아메리카노를 좋아함', ['취향']);
  mem.add('회의는 오전 10시 선호');
  assert.equal(mem.get(a.id).content, '커피는 아메리카노를 좋아함');
  assert.deepEqual(mem.get(a.id).tags, ['취향']);
  assert.equal(mem.list().length, 2);
  assert.deepEqual(mem.search('아메리카노').map((m) => m.id), [a.id]);
  assert.deepEqual(mem.search('취향').map((m) => m.id), [a.id]);
  assert.deepEqual(mem.search('100%'), []);
});

test('기억 수정은 내용과 수정 시각을 바꾼다', async (t) => {
  const { mem } = open(t, tempDbPath(t));
  const a = mem.add('첫 내용');
  await new Promise((r) => setTimeout(r, 5));
  const b = mem.update(a.id, '바뀐 내용', ['새태그']);
  assert.equal(b.content, '바뀐 내용');
  assert.deepEqual(b.tags, ['새태그']);
  assert.ok(b.updated_at > a.updated_at);
  assert.equal(b.created_at, a.created_at);
  assert.deepEqual(mem.update(a.id, '태그 유지').tags, ['새태그']);
});

test('삭제한 기억은 조회·검색·재시작 후에도 나오지 않는다', (t) => {
  const path = tempDbPath(t);
  const first = open(t, path);
  const keep = first.mem.add('남길 기억');
  const gone = first.mem.add('지울 비밀 아닌 기억');
  first.mem.delete(gone.id);
  assert.throws(() => first.mem.get(gone.id), { code: 'not_found' });
  assert.deepEqual(first.mem.search('지울'), []);
  first.db.close();

  const second = open(t, path);
  assert.deepEqual(second.mem.list().map((m) => m.id), [keep.id]);
  assert.equal(second.mem.get(keep.id).content, '남길 기억');
  assert.deepEqual(second.mem.search('지울'), []);
  const raw = second.db.prepare("SELECT count(*) AS n FROM memories WHERE content LIKE '%지울%'").get();
  assert.equal(raw.n, 0);
});

test('없는 기억 수정·삭제는 not_found', (t) => {
  const { mem } = open(t, tempDbPath(t));
  assert.throws(() => mem.update(5, 'x'), { code: 'not_found' });
  assert.throws(() => mem.delete(5), { code: 'not_found' });
});

test('빈 내용과 비밀 키 형태는 저장하지 않는다', (t) => {
  const { mem } = open(t, tempDbPath(t));
  assert.throws(() => mem.add('  '), { code: 'invalid_input' });
  const fakeKeys = [
    `내 키는 sk-${'a1B2'.repeat(8)}`,
    `sk-ant-${'x9Y8'.repeat(8)}`,
    `xai-${'Q1w2'.repeat(6)}`,
    'api_key = abcdef123456',
    'password: hunter2hunter2',
    'Zx9'.repeat(12),
  ];
  for (const k of fakeKeys) assert.throws(() => mem.add(k), { code: 'rejected_secret' }, k);
  const a = mem.add('정상 기억');
  assert.throws(() => mem.update(a.id, `token=${'Ab1'.repeat(6)}`), { code: 'rejected_secret' });
  assert.throws(() => mem.add('태그 확인', [`sk-${'a1B2'.repeat(8)}`]), { code: 'rejected_secret' });
  assert.equal(mem.list().length, 1);
});

test('평범한 한국어 문장은 비밀로 보지 않는다', () => {
  for (const s of ['내일 오후 3시에 치과 예약', 'API 사용법을 정리해 줘', 'password 정책을 알려 줘']) {
    assert.equal(looksLikeSecret(s), false, s);
  }
});
