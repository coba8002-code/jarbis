// 로컬 화면 서버 검사. 127.0.0.1에서만 열고, 가짜 공급자만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { tempDbPath } from './helpers.js';

const cloudSent = [];
function cloud() {
  return {
    name: 'cloud',
    describe: () => ({ name: 'cloud', baseUrl: 'https://cloud.example', model: 'm', remote: true }),
    async *stream(req) { cloudSent.push(req); yield { type: 'delta', text: '외부 답' }; yield { type: 'done', finishReason: 'stop' }; },
  };
}

async function start(t, dataDir = dirname(tempDbPath())) {
  const providers = new ProviderRegistry({ mock: createMockProvider('mock', { chunks: ['로컬', ' 답'] }), cloud: cloud() });
  const services = createServices({ dataDir, providers });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const call = (method, path, body, { token = app.token, host } = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const headers = { 'content-type': 'application/json' };
    if (token) headers['x-jarvis-token'] = token;
    if (host) headers.host = host;
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers }, (rs) => {
      let text = '';
      rs.on('data', (c) => { text += c; });
      rs.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* html */ }
        resolve({ status: rs.statusCode, json, text, headers: rs.headers });
      });
    });
    rq.on('error', reject);
    if (data) rq.write(data);
    rq.end();
  });
  return { app, services, port, call, dataDir };
}

test('127.0.0.1에만 열리고 화면에 실행별 토큰이 들어간다', async (t) => {
  const { app, call } = await start(t);
  assert.equal(app.server.address().address, '127.0.0.1');
  const page = await call('GET', '/', null, { token: null });
  assert.equal(page.status, 200);
  assert.ok(page.text.includes(app.token));
  assert.ok(!page.text.includes('__JARVIS_TOKEN__'));
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  const other = createAppServer({});
  assert.notEqual(other.token, app.token);
});

test('다른 Host 머리글은 거부한다 (DNS 리바인딩 방지)', async (t) => {
  const { call, port } = await start(t);
  assert.equal((await call('GET', '/', null, { host: `evil.example:${port}` })).status, 421);
  assert.equal((await call('GET', '/api/info', null, { host: 'evil.example' })).status, 421);
  assert.equal((await call('GET', '/api/info', null, { host: `localhost:${port}` })).status, 200);
});

test('토큰 없거나 틀리면 API를 거부한다', async (t) => {
  const { call } = await start(t);
  assert.equal((await call('GET', '/api/memories', null, { token: null })).status, 403);
  assert.equal((await call('POST', '/api/memories', { content: 'x' }, { token: 'wrong' })).status, 403);
  assert.equal((await call('GET', '/api/memories')).status, 200);
});

test('화면 API: 빠른 작업 → 승인 → 한 번 실행', async (t) => {
  const { call } = await start(t);
  const m = (await call('POST', '/api/quick/echo', { params: { text: '안녕' } })).json;
  assert.equal(m.status, 'pending');
  const early = await call('POST', `/api/missions/${m.id}/run`);
  assert.equal(early.status, 409);
  assert.equal(early.json.error.code, 'approval_required');
  assert.equal((await call('POST', `/api/missions/${m.id}/approve`, { version: 'f'.repeat(64) })).json.error.code, 'version_mismatch');
  assert.equal((await call('POST', `/api/missions/${m.id}/approve`, { version: m.content_version })).json.status, 'approved');
  const runs = await Promise.all([1, 2, 3].map(() => call('POST', `/api/missions/${m.id}/run`)));
  assert.equal(runs.filter((r) => r.status === 200).length, 1);
  assert.equal(runs.filter((r) => r.status === 409).length, 2);
  assert.equal((await call('GET', '/api/missions?status=done')).json.length, 1);
});

test('화면 API: 기억 저장·찾기·수정·삭제와 비밀 거부', async (t) => {
  const { call } = await start(t);
  const a = (await call('POST', '/api/memories', { content: '커피는 아메리카노', tags: ['취향'] })).json;
  assert.equal((await call('GET', `/api/memories?q=${encodeURIComponent('커피')}`)).json.length, 1);
  assert.equal((await call('PUT', `/api/memories/${a.id}`, { content: '차는 녹차' })).json.content, '차는 녹차');
  assert.deepEqual((await call('DELETE', `/api/memories/${a.id}`)).json, { id: a.id, deleted: true });
  assert.equal((await call('GET', '/api/memories')).json.length, 0);
  const s = await call('POST', '/api/memories', { content: `sk-${'a1B2'.repeat(8)}` });
  assert.equal(s.status, 400);
  assert.equal(s.json.error.code, 'rejected_secret');
});

test('화면 API: 외부+기억 대화는 승인 대기, 미리 보기 후 승인해야 보냄', async (t) => {
  const { call } = await start(t);
  cloudSent.length = 0;
  const mem = (await call('POST', '/api/memories', { content: '아메리카노를 좋아함' })).json;
  const local = await call('POST', '/api/chat', { provider: 'mock', question: '안녕', memoryIds: [mem.id] });
  assert.equal(local.json.status, 'sent');
  assert.equal(local.json.reply.text, '로컬 답');
  const r = (await call('POST', '/api/chat', { provider: 'cloud', question: '추천', memoryIds: [mem.id] })).json;
  assert.equal(r.status, 'approval_required');
  assert.equal(cloudSent.length, 0);
  const detail = (await call('GET', `/api/missions/${r.mission.id}`)).json;
  assert.match(detail.preview.request.messages[0].content, /아메리카노/);
  await call('POST', `/api/missions/${r.mission.id}/approve`, { version: detail.content_version });
  assert.equal((await call('POST', `/api/missions/${r.mission.id}/run`)).json.status, 'done');
  assert.equal(cloudSent.length, 1);
});

test('화면 API: 공급자 목록은 외부 여부를 보여 준다', async (t) => {
  const { call } = await start(t);
  const list = (await call('GET', '/api/providers')).json;
  const byName = Object.fromEntries(list.map((p) => [p.name, p.remote]));
  assert.equal(byName.mock, false);
  assert.equal(byName.cloud, true);
});

test('화면 API: 회의 목록·녹취·삭제', async (t) => {
  const { call, services } = await start(t);
  const m = services.meetings.start('주간 회의');
  services.meetings.addSegment(m.id, { startMs: 0, endMs: 1000, text: '시작' });
  assert.equal((await call('DELETE', `/api/meetings/${m.id}`)).status, 409);
  services.meetings.stop(m.id, 2000);
  assert.equal((await call('GET', `/api/meetings/${m.id}/segments`)).json[0].text, '시작');
  assert.equal((await call('DELETE', `/api/meetings/${m.id}`)).json.deleted, true);
  assert.equal((await call('GET', '/api/meetings')).json.length, 0);
});

test('잘못된 JSON·없는 주소 처리', async (t) => {
  const { call, port, app } = await start(t);
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('GET', '/nope', null, { token: null })).status, 404);
  const bad = await new Promise((resolve) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path: '/api/memories', method: 'POST', headers: { 'x-jarvis-token': app.token } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.end('{not json');
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'invalid_input');
});

test('재시작하면 실행 중이던 작업과 녹음 중이던 회의를 중단으로 바꾼다', async (t) => {
  const dataDir = dirname(tempDbPath());
  const first = createServices({ dataDir, providers: new ProviderRegistry({}) });
  const m = first.quick.request('echo', { text: 'x' });
  first.missions.approve(m.id, m.content_version);
  first.db.prepare("UPDATE missions SET status = 'running' WHERE id = ?").run(m.id);
  const meet = first.meetings.start('회의');
  first.close();
  const second = await start(t, dataDir);
  assert.deepEqual(second.services.recovered, { missions: [m.id], meetings: [meet.id] });
  const info = (await second.call('GET', '/api/info')).json;
  assert.equal(info.platform, process.platform);
});

// 2026-11-14 자비스 모드(/jarvis): 캐릭터 얼굴·대화 중심 화면 + 장치 점검. 설정 모드(/)와 같은 보안 규칙을 따른다.
test('자비스 모드 화면: 토큰이 들어가고, 이 화면만 카메라 시험을 허용하며, 외부 자원을 쓰지 않는다', async (t) => {
  const { app, call } = await start(t);
  const r = await call('GET', '/jarvis', undefined, { token: null });
  assert.equal(r.status, 200);
  assert.match(r.text, new RegExp(`content="${app.token}"`), '실행별 토큰이 화면에 들어감');
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(r.headers['permissions-policy'], 'microphone=(self), camera=(self), geolocation=()');
  // 설정 모드는 지금처럼 카메라를 막는다
  const settings = await call('GET', '/', undefined, { token: null });
  assert.equal(settings.headers['permissions-policy'], 'microphone=(self), camera=(), geolocation=()');
  // 화면은 이 서버의 정적 스크립트만 불러오고, 외부 주소·외부 스크립트가 없다
  assert.doesNotMatch(r.text, /https?:\/\//);
  assert.deepEqual([...r.text.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort(), ['/static/avatar.js', '/static/faces.js', '/static/presence.js', '/static/voice-input.js']);
  for (const s of ['/static/avatar.js', '/static/faces.js', '/static/presence.js', '/static/voice-input.js']) assert.equal((await call('GET', s, undefined, { token: null })).status, 200);
  // 다른 호스트 이름으로는 거부(DNS 리바인딩 방지는 그대로)
  assert.equal((await call('GET', '/jarvis', undefined, { token: null, host: 'evil.example' })).status, 421);
});

test('외부 접속 옵션(host)을 주면 그 주소로도 열리고, 주지 않으면 이 기기 전용이다', async (t) => {
  const dataDir = dirname(tempDbPath());
  const services = createServices({ dataDir, providers: new ProviderRegistry({ mock: createMockProvider('mock') }) });
  const app = createAppServer(services);
  const { port, url, lan } = await app.listen(0, { host: '192.0.2.10' });
  t.after(async () => { await app.close(); services.close(); });
  assert.equal(lan, true);
  assert.equal(url, `http://192.0.2.10:${port}/`);
  assert.equal(app.server.address().address, '0.0.0.0');
  const get = (host) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path: '/jarvis', method: 'GET', headers: { host } }, (rs) => { rs.resume(); rs.on('end', () => resolve(rs.statusCode)); });
    rq.on('error', reject); rq.end();
  });
  assert.equal(await get(`192.0.2.10:${port}`), 200, '허용한 주소');
  assert.equal(await get(`127.0.0.1:${port}`), 200, '이 기기 주소');
  assert.equal(await get(`evil.example:${port}`), 421, '그 밖의 주소는 거부');
});
