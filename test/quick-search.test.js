// 실제 로컬 Quick Action 기억 검색·회의록 검색(FR-007a, T244·T245) 검사.
// 승인 경로(미리 보기·승인 전 결과 없음·거절·취소·중복), 잘못된 입력, 결과에 원문이 남지 않는지(DB 파일 바이트), API·CLI 경로.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath, fakeKey } from './helpers.js';

const pexec = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const SAFE_ENV = { ...process.env, JARVIS_NO_ENV_FILE: '1' };
for (const k of ['JARVIS_ALLOW_REMOTE', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY']) delete SAFE_ENV[k];

async function start(t) {
  const dataDir = dirname(tempDbPath());
  const services = createServices({ dataDir, providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const call = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  return { services, call, dataDir };
}

function seed(services) {
  const keep = services.memory.add('커피는 아메리카노 SECRETCOFFEE1', ['취향']);
  const gone = services.memory.add('커피 원두는 에티오피아 GONEBEAN2');
  services.memory.add('운동은 아침에');
  const m = services.meetings.start('커피 회의');
  const s1 = services.meetings.addSegment(m.id, { startMs: 1000, endMs: 3000, text: '커피 예산 TRANSCRIPTX3 논의' });
  services.meetings.addSegment(m.id, { startMs: 4000, endMs: 6000, text: '다음 안건' });
  services.meetings.stop(m.id, 7000);
  return { keep, gone, meeting: m, s1 };
}

const fileHas = (dataDir, text) => ['jarvis.db', 'jarvis.db-wal'].some((f) => existsSync(join(dataDir, f)) && readFileSync(join(dataDir, f)).includes(Buffer.from(text, 'utf8')));

test('목록에 검색 빠른 작업이 있고, 요청하면 미리 보기만 있는 승인 대기 미션이 된다', async (t) => {
  const { services, call } = await start(t);
  seed(services);
  const list = (await call('GET', '/api/quick')).json;
  assert.deepEqual(list.map((q) => [q.name, q.param]), [['echo', 'text'], ['fail-demo', 'text'], ['memory-search', 'q'], ['meeting-search', 'q']]);
  const m = (await call('POST', '/api/quick/memory-search', { params: { q: ' 커피 ' } })).json;
  assert.equal(m.status, 'pending');
  assert.equal(m.kind, 'local.memory.search');
  assert.equal(m.source, 'quick:memory-search');
  assert.deepEqual(m.content, { query: '커피' });
  assert.equal(m.target, 'local:memory (이 기기 기억)');
  assert.match(m.impact, /기억 3개에서 찾음.*외부 전송 없음.*번호만/);
  assert.equal(m.result, null); // 승인 전 결과 없음
  const early = await call('POST', `/api/missions/${m.id}/run`);
  assert.equal(early.status, 409);
  assert.equal(early.json.error.code, 'approval_required');
  assert.equal((await call('GET', `/api/missions/${m.id}`)).json.result, null);
});

test('승인 뒤 한 번만 실행되고, 결과에는 번호만 담긴다(기억·회의록)', async (t) => {
  const { services, call } = await start(t);
  const { keep, gone, meeting, s1 } = seed(services);
  const mem = (await call('POST', '/api/quick/memory-search', { params: { q: '커피' } })).json;
  await call('POST', `/api/missions/${mem.id}/approve`, { version: mem.content_version });
  const runs = await Promise.all([1, 2, 3].map(() => call('POST', `/api/missions/${mem.id}/run`)));
  assert.equal(runs.filter((r) => r.status === 200).length, 1);
  const done = (await call('GET', `/api/missions/${mem.id}`)).json;
  assert.equal(done.status, 'done');
  assert.deepEqual(done.result, { count: 2, memoryIds: [keep.id, gone.id] });
  assert.equal(JSON.stringify(done.result).includes('아메리카노'), false);

  const meet = (await call('POST', '/api/quick/meeting-search', { params: { q: '커피' } })).json;
  assert.match(meet.impact, /회의 1개에서 찾음.*녹취 원문은 저장하지 않음/);
  await call('POST', `/api/missions/${meet.id}/approve`, { version: meet.content_version });
  const r = (await call('POST', `/api/missions/${meet.id}/run`)).json;
  assert.equal(r.status, 'done');
  assert.deepEqual(r.result, { count: 1, truncated: false, hits: [{ meetingId: meeting.id, titleMatch: true, segments: [{ id: s1.id, start_ms: 1000, end_ms: 3000 }] }] });
  assert.equal((await call('POST', `/api/missions/${meet.id}/run`)).status, 409); // 두 번째 실행 없음
});

test('거절·취소한 검색은 실행되지 않고, 내용을 바꾸면 다시 승인해야 한다', async (t) => {
  const { services, call } = await start(t);
  seed(services);
  const a = (await call('POST', '/api/quick/memory-search', { params: { q: '커피' } })).json;
  await call('POST', `/api/missions/${a.id}/reject`);
  assert.equal((await call('POST', `/api/missions/${a.id}/run`)).status, 409);
  const b = (await call('POST', '/api/quick/meeting-search', { params: { q: '커피' } })).json;
  await call('POST', `/api/missions/${b.id}/approve`, { version: b.content_version });
  await call('POST', `/api/missions/${b.id}/cancel`);
  assert.equal((await call('POST', `/api/missions/${b.id}/run`)).status, 409);
  const c = services.quick.request('memory-search', { q: '커피' });
  services.missions.approve(c.id, c.content_version);
  services.missions.update(c.id, { content: { query: '운동' } });
  await assert.rejects(services.missions.execute(c.id), { code: 'approval_required' });
  for (const m of [a, b]) assert.equal((await call('GET', `/api/missions/${m.id}`)).json.result, null);
});

test('잘못된 검색어는 미션을 만들지 않는다(빈 값·100자 초과·비밀처럼 보이는 값·숫자)', async (t) => {
  const { call } = await start(t);
  for (const params of [{}, { q: '' }, { q: '   ' }, { q: 'x'.repeat(101) }, { q: 123 }]) {
    const r = await call('POST', '/api/quick/memory-search', { params });
    assert.equal(r.status, 400, JSON.stringify(params));
  }
  const secret = await call('POST', '/api/quick/meeting-search', { params: { q: fakeKey('sk', 36) } });
  assert.equal(secret.status, 400);
  assert.equal(secret.json.error.code, 'rejected_secret');
  assert.deepEqual((await call('GET', '/api/missions')).json, []);
});

test('미션 내용이 잘못된 검색어로 바뀌면 실행기에서 다시 막고 실패로 기록한다', async (t) => {
  const { services } = await start(t);
  const m = services.quick.request('memory-search', { q: '커피' });
  const changed = services.missions.update(m.id, { content: { query: '' } });
  services.missions.approve(m.id, changed.content_version);
  const r = await services.missions.execute(m.id);
  assert.equal(r.status, 'failed');
  assert.equal(r.result, null);
});

test('특수문자 검색어도 글자 그대로 찾는다(% _)', async (t) => {
  const { services, call } = await start(t);
  services.memory.add('할인율 30% 적용');
  services.memory.add('파일 a_b');
  services.memory.add('파일 axb');
  const m = (await call('POST', '/api/quick/memory-search', { params: { q: '%' } })).json;
  await call('POST', `/api/missions/${m.id}/approve`, { version: m.content_version });
  assert.equal((await call('POST', `/api/missions/${m.id}/run`)).json.result.count, 1);
  const u = (await call('POST', '/api/quick/memory-search', { params: { q: 'a_b' } })).json;
  await call('POST', `/api/missions/${u.id}/approve`, { version: u.content_version });
  assert.equal((await call('POST', `/api/missions/${u.id}/run`)).json.result.count, 1);
});

test('검색 결과 뒤 기억·녹취를 지우면 원문이 DB 파일에도 미션 기록에도 남지 않는다', async (t) => {
  const { services, call, dataDir } = await start(t);
  const { gone, meeting } = seed(services);
  for (const name of ['memory-search', 'meeting-search']) {
    const m = (await call('POST', `/api/quick/${name}`, { params: { q: '커피' } })).json;
    await call('POST', `/api/missions/${m.id}/approve`, { version: m.content_version });
    await call('POST', `/api/missions/${m.id}/run`);
  }
  await call('DELETE', `/api/memories/${gone.id}`);
  await call('DELETE', `/api/meetings/${meeting.id}`);
  assert.equal(fileHas(dataDir, 'GONEBEAN2'), false, '지운 기억 원문');
  assert.equal(fileHas(dataDir, 'TRANSCRIPTX3'), false, '지운 녹취 원문');
  assert.equal(fileHas(dataDir, 'SECRETCOFFEE1'), true, '남긴 기억은 그대로');
  const missions = (await call('GET', '/api/missions')).json;
  assert.equal(JSON.stringify(missions).includes('GONEBEAN2') || JSON.stringify(missions).includes('TRANSCRIPTX3'), false);
  // 검색어 자체("커피")는 승인한 미션 내용으로 남는다(명세 FR-007a)
  assert.equal(missions.every((m) => m.content.query === '커피'), true);
});

test('CLI 경로: quick run memory-search → 승인 → 실행', async (t) => {
  const db = tempDbPath();
  const cli = async (...args) => {
    try { const { stdout } = await pexec(process.execPath, [CLI, '--db', db, ...args], { env: SAFE_ENV }); return JSON.parse(stdout); } catch (e) { return JSON.parse(e.stdout); }
  };
  await cli('memory', 'add', '서울 출장');
  const list = await cli('quick', 'list');
  assert.deepEqual(list.map((q) => q.name), ['echo', 'fail-demo', 'memory-search', 'meeting-search']);
  const m = await cli('quick', 'run', 'memory-search', '--param', 'q=출장');
  assert.equal(m.status, 'pending');
  assert.equal((await cli('mission', 'run', String(m.id))).error.code, 'approval_required');
  await cli('mission', 'approve', String(m.id), '--version', m.content_version);
  const done = await cli('mission', 'run', String(m.id));
  assert.deepEqual(done.result, { count: 1, memoryIds: [1] });
  const meet = await cli('quick', 'run', 'meeting-search', '--param', 'q=회의');
  await cli('mission', 'approve', String(meet.id), '--version', meet.content_version);
  assert.deepEqual((await cli('mission', 'run', String(meet.id))).result, { count: 0, truncated: false, hits: [] });
});
