// 구글 캘린더·Tasks 연동 검사. 실제 구글 서버에는 보내지 않는다(가짜 fetch). 로그인 받는 곳만 127.0.0.1에 실제로 연다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { GoogleLink, localRfc3339, mapEvent, mapTask } from '../src/integrations/google.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

const URLS = { auth: 'https://auth.g.test/o', token: 'https://token.g.test/token', revoke: 'https://token.g.test/revoke', calendar: 'https://api.g.test/calendar/v3', tasks: 'https://api.g.test/tasks/v1' };
const ENV = { JARVIS_GOOGLE_CLIENT_ID: 'cid.apps.test', JARVIS_GOOGLE_CLIENT_SECRET: 'csecret-test' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// 가짜 구글: 받은 요청을 적어 두고, 정해 둔 답을 준다.
function fakeGoogle({ tokens = {}, events = [], tasks = [] } = {}) {
  const calls = [];
  let accessNo = 0;
  const state = { failNext401: false, refreshError: null, events: [...events], tasks: [...tasks] };
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(String(url));
    const body = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body) : opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method ?? 'GET', url: u, body, auth: opts.headers?.authorization ?? null });
    if (u.href === URLS.token) {
      if (body.grant_type === 'refresh_token' && state.refreshError) return json(400, { error: state.refreshError });
      accessNo += 1;
      return json(200, { access_token: `at-${accessNo}`, expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks', ...(body.grant_type === 'authorization_code' ? { refresh_token: 'rt-secret-value' } : {}), ...tokens });
    }
    if (u.href === URLS.revoke) return new Response('', { status: 200 });
    if (state.failNext401) { state.failNext401 = false; return json(401, { error: { code: 401 } }); }
    if (u.pathname.endsWith('/calendars/primary/events')) {
      if ((opts.method ?? 'GET') === 'GET') return json(200, { items: state.events });
      const created = { id: `ev${state.events.length + 1}`, status: 'confirmed', ...body };
      state.events.push(created);
      return json(200, created);
    }
    if (u.pathname.endsWith('/lists/@default/tasks')) {
      if ((opts.method ?? 'GET') === 'GET') return json(200, { items: state.tasks });
      const created = { id: `t${state.tasks.length + 1}`, status: 'needsAction', ...body };
      state.tasks.push(created);
      return json(200, created);
    }
    const tm = u.pathname.match(/\/lists\/@default\/tasks\/([^/]+)$/);
    if (tm && opts.method === 'PATCH') {
      const t = state.tasks.find((x) => x.id === decodeURIComponent(tm[1]));
      if (!t) return json(404, { error: { code: 404 } });
      Object.assign(t, body);
      return json(200, t);
    }
    return json(404, { error: { code: 404 } });
  };
  return { fetchImpl, calls, state };
}

const get = (url) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const rq = httpRequest({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET' }, (rs) => {
    let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, text }));
  });
  rq.on('error', reject); rq.end();
});

function link(t, fake, env = ENV) {
  const g = new GoogleLink({ dataDir: dirname(tempDbPath()), env, fetchImpl: fake.fetchImpl, urls: URLS, now: () => new Date(2026, 10, 15, 9, 0) });
  t.after(() => g.close());
  return g;
}

async function connected(t, fake) {
  const g = link(t, fake);
  const { authUrl } = await g.connect();
  const q = new URL(authUrl).searchParams;
  await get(`${q.get('redirect_uri')}?state=${q.get('state')}&code=good-code`);
  await g.pending?.done;
  return g;
}

test('설정이 없으면 연결을 시작하지 않는다', async (t) => {
  const g = link(t, fakeGoogle(), {});
  assert.equal(g.status().configured, false);
  await assert.rejects(() => g.connect(), { code: 'not_configured' });
  await assert.rejects(() => g.events(), { code: 'google_not_connected' });
});

test('로그인: PKCE·state를 쓰고, 이 PC(127.0.0.1)로 돌아오며, 받은 열쇠는 파일에만 둔다', async (t) => {
  const fake = fakeGoogle();
  const g = link(t, fake);
  const { authUrl } = await g.connect();
  const u = new URL(authUrl);
  assert.equal(u.origin + u.pathname, URLS.auth);
  const q = u.searchParams;
  assert.equal(q.get('client_id'), ENV.JARVIS_GOOGLE_CLIENT_ID);
  assert.match(q.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('access_type'), 'offline');
  assert.match(q.get('scope'), /calendar\.events/);
  assert.match(q.get('scope'), /auth\/tasks/);
  assert.equal(authUrl.includes(ENV.JARVIS_GOOGLE_CLIENT_SECRET), false, '비밀 값은 로그인 주소에 넣지 않음');
  assert.equal(g.status().waiting, true);
  // 확인 값이 틀리면 거부
  const bad = await get(`${q.get('redirect_uri')}?state=wrong&code=x`);
  assert.equal(bad.status, 400);
  assert.equal(g.status().connected, false);
  const ok = await get(`${q.get('redirect_uri')}?state=${q.get('state')}&code=good-code`);
  assert.equal(ok.status, 200);
  assert.match(ok.text, /연결했어요/);
  const ex = fake.calls.find((c) => c.url.href === URLS.token);
  assert.equal(ex.body.code, 'good-code');
  assert.equal(ex.body.grant_type, 'authorization_code');
  assert.equal(createHash('sha256').update(ex.body.code_verifier).digest('base64url'), q.get('code_challenge'));
  const st = g.status();
  assert.equal(st.connected, true);
  assert.equal(st.waiting, false);
  assert.equal(JSON.stringify(st).includes('rt-secret-value'), false, '상태에 열쇠를 내보내지 않음');
  assert.equal(JSON.parse(readFileSync(g.file, 'utf8')).refresh_token, 'rt-secret-value');
});

test('로그인에서 거부하면 연결하지 않는다', async (t) => {
  const g = link(t, fakeGoogle());
  const q = new URL((await g.connect()).authUrl).searchParams;
  const r = await get(`${q.get('redirect_uri')}?state=${q.get('state')}&error=access_denied`);
  assert.equal(r.status, 200);
  assert.equal(g.status().connected, false);
  assert.equal(g.status().lastError.code, 'google_denied');
});

test('일정: 오늘부터 정한 날 수만, 취소된 일정 빼고, 1분 동안은 다시 묻지 않는다', async (t) => {
  const fake = fakeGoogle({ events: [
    { id: 'a', summary: '팀 회의', start: { dateTime: '2026-11-15T10:00:00+09:00' }, end: { dateTime: '2026-11-15T11:00:00+09:00' }, location: '3층' },
    { id: 'b', start: { date: '2026-11-16' }, end: { date: '2026-11-17' } },
    { id: 'c', status: 'cancelled', summary: '취소됨', start: { date: '2026-11-16' } },
  ] });
  const g = await connected(t, fake);
  const list = await g.events({ days: 3 });
  assert.deepEqual(list.map((e) => e.id), ['a', 'b']);
  assert.equal(list[0].title, '팀 회의');
  assert.equal(list[1].title, '(제목 없음)');
  assert.equal(list[1].allDay, true);
  const call = fake.calls.find((c) => c.url.pathname.endsWith('/events'));
  assert.equal(call.auth, 'Bearer at-1');
  assert.equal(call.url.searchParams.get('singleEvents'), 'true');
  const from = new Date(call.url.searchParams.get('timeMin'));
  const to = new Date(call.url.searchParams.get('timeMax'));
  assert.equal(Math.round((to - from) / 86_400_000), 3);
  const n = fake.calls.length;
  await g.events({ days: 3 });
  assert.equal(fake.calls.length, n, '캐시');
  await assert.rejects(() => g.events({ days: 0 }), { code: 'invalid_input' });
  await assert.rejects(() => g.events({ days: 40 }), { code: 'invalid_input' });
});

test('일정 추가: 시각이 있으면 이 PC 시간대로, 없으면 하루 종일. 잘못된 값은 거부', async (t) => {
  const fake = fakeGoogle();
  const g = await connected(t, fake);
  const timed = await g.addEvent({ title: '치과', date: '2026-11-20', start: '14:30' });
  const sent = fake.calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/events')).at(-1).body;
  assert.equal(sent.summary, '치과');
  assert.equal(sent.start.dateTime, localRfc3339('2026-11-20', '14:30'));
  assert.equal(sent.end.dateTime, localRfc3339('2026-11-20', '15:30'));
  assert.equal(timed.allDay, false);
  await g.addEvent({ title: '여행', date: '2026-12-31' });
  const allDay = fake.calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/events')).at(-1).body;
  assert.deepEqual(allDay.start, { date: '2026-12-31' });
  assert.deepEqual(allDay.end, { date: '2027-01-01' });
  for (const bad of [{ title: '', date: '2026-11-20' }, { title: 'x', date: '2026-02-30' }, { title: 'x', date: '2026-11-20', start: '25:00' }, { title: 'x', date: '2026-11-20', start: '10:00', end: '09:00' }, { title: 'x'.repeat(201), date: '2026-11-20' }]) {
    await assert.rejects(() => g.addEvent(bad), { code: 'invalid_input' }, JSON.stringify(bad).slice(0, 60));
  }
  assert.match(localRfc3339('2026-11-20', '09:05'), /^2026-11-20T09:05:00[+-]\d{2}:\d{2}$/);
});

test('할 일: 끝내지 않은 것만 날짜 순으로, 추가·완료, 잘못된 번호는 거부', async (t) => {
  const fake = fakeGoogle({ tasks: [
    { id: 't1', title: '장보기', status: 'needsAction' },
    { id: 't2', title: '보고서', status: 'needsAction', due: '2026-11-14T00:00:00.000Z' },
    { id: 't3', title: '끝난 일', status: 'completed' },
  ] });
  const g = await connected(t, fake);
  assert.deepEqual((await g.tasks()).map((x) => x.id), ['t2', 't1']);
  const added = await g.addTask({ title: '운동', due: '2026-11-16' });
  assert.equal(added.due, '2026-11-16');
  assert.equal(fake.calls.at(-1).body.due, '2026-11-16T00:00:00.000Z');
  const done = await g.completeTask('t1');
  assert.equal(done.done, true);
  assert.deepEqual(fake.calls.at(-1).body, { status: 'completed' });
  assert.deepEqual((await g.tasks()).map((x) => x.id), ['t2', 't4'], '추가·완료 뒤에는 캐시를 버리고 다시 읽음');
  await assert.rejects(() => g.completeTask('../x'), { code: 'invalid_input' });
  await assert.rejects(() => g.addTask({ title: '  ' }), { code: 'invalid_input' });
  await assert.rejects(() => g.addTask({ title: 'x', due: '11/20' }), { code: 'invalid_input' });
});

test('열쇠: 만료 전이면 다시 받지 않고, 401이면 새로 받아 한 번만 다시, 연결이 취소됐으면 파일을 지운다', async (t) => {
  const fake = fakeGoogle();
  const g = await connected(t, fake);
  await g.tasks();
  assert.equal(fake.calls.filter((c) => c.url.href === URLS.token).length, 1);
  g.cache.clear();
  fake.state.failNext401 = true;
  await g.tasks();
  const tokenCalls = fake.calls.filter((c) => c.url.href === URLS.token);
  assert.equal(tokenCalls.length, 2);
  assert.equal(tokenCalls[1].body.grant_type, 'refresh_token');
  assert.equal(fake.calls.at(-1).auth, 'Bearer at-2');
  g.cache.clear();
  fake.state.failNext401 = true;
  fake.state.refreshError = 'invalid_grant';
  await assert.rejects(() => g.tasks(), { code: 'google_not_connected' });
  assert.equal(existsSync(g.file), false);
  assert.equal(g.status().connected, false);
});

test('끊기: 구글에 취소를 알리고 열쇠 파일을 지운다', async (t) => {
  const fake = fakeGoogle();
  const g = await connected(t, fake);
  const r = await g.disconnect();
  assert.deepEqual(r, { connected: false, revoked: true });
  assert.equal(fake.calls.at(-1).url.href, URLS.revoke);
  assert.equal(fake.calls.at(-1).body.token, 'rt-secret-value');
  assert.equal(existsSync(g.file), false);
});

test('화면용 변환은 필요한 칸만 남긴다', () => {
  assert.deepEqual(Object.keys(mapEvent({ id: 'x', summary: 's', description: '비밀 메모', attendees: [{ email: 'a@b.c' }], start: { date: '2026-11-15' } })).sort(), ['allDay', 'end', 'id', 'location', 'start', 'title']);
  assert.deepEqual(Object.keys(mapTask({ id: 'x', title: 't', notes: '메모' })).sort(), ['done', 'due', 'id', 'title']);
});

test('아침 브리핑: 연결돼 있으면 오늘 일정·할 일을 이 기기 안 모델에만 넣는다', async (t) => {
  const fake = fakeGoogle({
    events: [{ id: 'a', summary: '팀 회의', start: { dateTime: '2026-11-15T10:00:00+09:00' }, end: { dateTime: '2026-11-15T11:00:00+09:00' } }],
    tasks: [{ id: 't1', title: '보고서 내기', status: 'needsAction', due: '2026-11-15T00:00:00.000Z' }],
  });
  const sent = [];
  const ollama = {
    name: 'ollama',
    describe: () => ({ name: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'gemma4:12b', remote: false }),
    async *stream(req) { sent.push(req); yield { type: 'delta', text: '오늘은 회의가 있어요.' }; yield { type: 'done', finishReason: 'stop' }; },
  };
  const dataDir = dirname(tempDbPath());
  const services = createServices({ dataDir, providers: new ProviderRegistry({ ollama }), env: ENV, googleFetch: fake.fetchImpl, googleUrls: URLS, speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  t.after(() => services.close());
  // 연결 전: 구글 자료 없음
  await services.briefings.generate();
  assert.equal(sent.at(-1).messages[1].content.includes('구글'), false);
  const q = new URL((await services.google.connect()).authUrl).searchParams;
  await get(`${q.get('redirect_uri')}?state=${q.get('state')}&code=c`);
  const b = await services.briefings.generate();
  assert.ok(b.sources.includes('google'));
  const text = sent.at(-1).messages[1].content;
  assert.match(text, /=== 구글 오늘 일정·할 일 ===/);
  assert.match(text, /팀 회의/);
  assert.match(text, /보고서 내기/);
  assert.equal(existsSync(join(dataDir, 'google-token.json')), true);
});

test('화면 서버: 연결은 이 PC 화면에서만, 쓰기는 확인(confirm)이 있어야, 상태에 열쇠가 없다', async (t) => {
  const fake = fakeGoogle({ tasks: [{ id: 't1', title: '장보기', status: 'needsAction' }] });
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), env: ENV, googleFetch: fake.fetchImpl, googleUrls: URLS });
  const app = createAppServer(services);
  const { port } = await app.listen(0, { host: '192.0.2.10' });
  t.after(async () => { await app.close(); services.close(); });
  const call = (method, path, body, host = `127.0.0.1:${port}`) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { host, 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject); if (data) rq.write(data); rq.end();
  });
  assert.equal((await call('GET', '/api/google/tasks')).json.error.code, 'google_not_connected');
  assert.equal((await call('POST', '/api/google/connect', {}, `192.0.2.10:${port}`)).status, 403);
  const c = await call('POST', '/api/google/connect', {});
  assert.equal(c.status, 200);
  const q = new URL(c.json.authUrl).searchParams;
  await get(`${q.get('redirect_uri')}?state=${q.get('state')}&code=c`);
  const st = await call('GET', '/api/google');
  assert.equal(st.json.connected, true);
  assert.equal(JSON.stringify(st.json).includes('rt-secret-value'), false);
  assert.equal((await call('GET', '/api/google/tasks')).json[0].title, '장보기');
  assert.equal((await call('POST', '/api/google/tasks', { title: '운동' })).status, 400);
  assert.equal((await call('POST', '/api/google/tasks', { title: '운동', confirm: true })).json.title, '운동');
  assert.equal((await call('POST', '/api/google/tasks/t1/complete', {})).status, 400);
  assert.equal((await call('POST', '/api/google/tasks/t1/complete', { confirm: true })).json.done, true);
  assert.equal((await call('POST', '/api/google/events', { title: '치과', date: '2026-11-20', start: '14:30', confirm: true })).status, 200);
  assert.equal((await call('DELETE', '/api/google')).json.connected, false);
});
