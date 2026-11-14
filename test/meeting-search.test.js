// 회의록 검색(FR-008a, T242·T243) 검사. 제목·녹취·시간 구간, 특수문자, 지운 뒤 결과, API 경로.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { openDb } from '../src/store/db.js';
import { MeetingStore } from '../src/meeting/meetings.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

// 회의 셋: 녹취 글에 특수문자가 섞여 있다. 원음 파일은 만들지 않는다(검색만 본다).
function seed(store) {
  const a = store.start('주간 회의');
  store.addSegment(a.id, { startMs: 0, endMs: 2000, text: '예산은 100% 확정입니다' });
  store.addSegment(a.id, { startMs: 2500, endMs: 5000, text: '파일 이름은 report_v2 입니다' });
  store.addSegment(a.id, { startMs: 6000, endMs: 9000, text: '경로는 C:\\data\\예산 폴더' });
  store.stop(a.id, 10000);
  const b = store.start('예산 검토 50%');
  store.addSegment(b.id, { startMs: 1000, endMs: 3000, text: "그는 \"좋다\"고 했고 'OK' 라고 답함" });
  store.addSegment(b.id, { startMs: 4000, endMs: 6000, text: '이모지 🎉 축하합니다 Budget' });
  store.stop(b.id, 7000);
  const c = store.start('잡담');
  store.addSegment(c.id, { startMs: 0, endMs: 1000, text: '점심 메뉴 이야기' });
  store.stop(c.id, 2000);
  return { a, b, c };
}

function open(t) {
  const path = tempDbPath();
  const db = openDb(path);
  t.after(() => db.close());
  const store = new MeetingStore(db, { audioDir: join(dirname(path), 'meetings') });
  return { store, ...seed(store) };
}

const shape = (r) => r.results.map((x) => [x.meeting.title, x.titleMatch, x.segments.map((s) => [s.start_ms, s.end_ms, s.text])]);

test('제목과 녹취를 함께 찾고, 회의별로 시간 순 구간을 준다', (t) => {
  const { store } = open(t);
  const r = store.search(' 예산 ');
  assert.equal(r.query, '예산');
  assert.deepEqual(shape(r), [
    ['주간 회의', false, [[0, 2000, '예산은 100% 확정입니다'], [6000, 9000, '경로는 C:\\data\\예산 폴더']]],
    ['예산 검토 50%', true, []],
  ]);
  assert.equal(r.segmentCount, 2);
  assert.equal(r.truncated, false);
  // 영문은 대소문자를 가리지 않는다
  assert.deepEqual(shape(store.search('budget'))[0][2], [[4000, 6000, '이모지 🎉 축하합니다 Budget']]);
  assert.deepEqual(store.search('없는 말').results, []);
});

test('특수문자는 글자 그대로 찾는다(% _ \\ 따옴표 이모지)', (t) => {
  const { store } = open(t);
  // %는 "모든 글자"가 아니라 % 글자만: 100%가 있는 구간과 제목 "50%"만 나온다
  assert.deepEqual(shape(store.search('%')), [
    ['주간 회의', false, [[0, 2000, '예산은 100% 확정입니다']]],
    ['예산 검토 50%', true, []],
  ]);
  // _는 "아무 글자 하나"가 아니라 _ 글자만
  assert.deepEqual(shape(store.search('t_v')).map((x) => x[2].length), [1]);
  assert.deepEqual(store.search('rt_v2').results[0].segments[0].text, '파일 이름은 report_v2 입니다');
  assert.deepEqual(store.search('rtXv2').results, []);
  assert.equal(store.search('C:\\data').results[0].segments[0].start_ms, 6000);
  assert.equal(store.search('"좋다"').results[0].segments[0].start_ms, 1000);
  assert.equal(store.search("'OK'").results[0].segments[0].start_ms, 1000);
  assert.equal(store.search('🎉').results[0].segments[0].start_ms, 4000);
  // SQL처럼 보이는 글도 그냥 글자로 찾는다(결과 없음, 오류 없음, 자료 그대로)
  assert.deepEqual(store.search("'; DROP TABLE meetings; --").results, []);
  assert.equal(store.list().length, 3);
});

test('잘못된 검색어는 거부한다', (t) => {
  const { store } = open(t);
  assert.throws(() => store.search(''), { code: 'invalid_input' });
  assert.throws(() => store.search('   '), { code: 'invalid_input' });
  assert.throws(() => store.search(undefined), { code: 'invalid_input' });
  assert.throws(() => store.search('가'.repeat(101)), { code: 'invalid_input' });
  assert.doesNotThrow(() => store.search('가'.repeat(100)));
});

test('지운 회의·녹취는 검색되지 않는다', (t) => {
  const { store, a, b } = open(t);
  store.deleteTranscript(a.id); // 녹취만 지움: 제목은 남음
  assert.deepEqual(shape(store.search('예산')), [['예산 검토 50%', true, []]]);
  store.delete(b.id); // 회의 통째로
  assert.deepEqual(store.search('예산').results, []);
  assert.deepEqual(store.search('좋다').results, []);
});

test('결과가 너무 많으면 잘라서 알린다', (t) => {
  const { store } = open(t);
  const m = store.start('긴 회의');
  for (let i = 0; i < 5; i += 1) store.addSegment(m.id, { startMs: i * 1000, endMs: i * 1000 + 500, text: `반복 말 ${i}` });
  const r = store.search('반복', { limit: 3 });
  assert.equal(r.segmentCount, 3);
  assert.equal(r.truncated, true);
  assert.deepEqual(r.results[0].segments.map((s) => s.start_ms), [0, 1000, 2000]);
});

test('API: GET /api/meetings/search (토큰 필요, 인코딩한 특수문자, 빈 검색어 400)', async (t) => {
  const dataDir = dirname(tempDbPath());
  const services = createServices({ dataDir, providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  seed(services.meetings);
  const get = (q, token = app.token) => fetch(`http://127.0.0.1:${port}/api/meetings/search${q}`, { headers: { 'x-jarvis-token': token } })
    .then(async (r) => ({ status: r.status, json: await r.json() }));
  const pct = await get(`?q=${encodeURIComponent('%')}`);
  assert.equal(pct.status, 200);
  assert.deepEqual(pct.json.results.map((x) => x.meeting.title), ['주간 회의', '예산 검토 50%']);
  assert.equal((await get(`?q=${encodeURIComponent('report_v2')}`)).json.results[0].segments[0].start_ms, 2500);
  assert.equal((await get('?q=')).status, 400);
  assert.equal((await get('')).status, 400);
  assert.equal((await get('?q=x', 'wrong')).status, 403);
  // /api/meetings/:id 경로와 겹치지 않는다
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/meetings`, { headers: { 'x-jarvis-token': app.token } })).status, 200);
});
