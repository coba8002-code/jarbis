// 빠른 답(생각 생략, T097) 검사. 127.0.0.1 가짜 Ollama 서버와 기록용 공급자만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { createHttpProviders } from '../src/providers/adapters.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

async function fakeOllama(t) {
  const bodies = [];
  const server = createServer((rq, rs) => {
    let b = '';
    rq.on('data', (c) => { b += c; });
    rq.on('end', () => {
      bodies.push(JSON.parse(b));
      rs.writeHead(200, { 'content-type': 'application/x-ndjson' });
      rs.end(`${JSON.stringify({ message: { content: '답' } })}\n${JSON.stringify({ done: true, done_reason: 'stop' })}\n`);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { bodies, base: `http://127.0.0.1:${server.address().port}` };
}

const req = { messages: [{ role: 'user', content: '안녕' }] };
async function drain(p, request) { for await (const ev of p.ollama.stream(request)) void ev; }

test('Ollama 어댑터: think가 정해졌을 때만 넘기고, 없으면 보내지 않는다', async (t) => {
  const fake = await fakeOllama(t);
  const p = createHttpProviders({ env: { JARVIS_OLLAMA_BASE_URL: fake.base, JARVIS_OLLAMA_MODEL: 'm' } });
  await drain(p, req);
  await drain(p, { ...req, think: false });
  await drain(p, { ...req, think: true });
  assert.equal('think' in fake.bodies[0], false);
  assert.equal(fake.bodies[1].think, false);
  assert.equal(fake.bodies[2].think, true);
});

function recorder() {
  const sent = [];
  return {
    sent,
    provider: {
      name: 'rec',
      describe: () => ({ name: 'rec', baseUrl: 'http://127.0.0.1:1', model: 'm', remote: false }),
      async *stream(request) { sent.push(request); yield { type: 'delta', text: '답' }; yield { type: 'done', finishReason: 'stop' }; },
    },
  };
}

test('빠른 답 설정: 기본 켬(think:false), 끄면 think를 보내지 않고, 끈 값이 재시작 후 유지', async (t) => {
  const dataDir = dirname(tempDbPath());
  const rec = recorder();
  const make = () => createServices({ dataDir, providers: new ProviderRegistry({ rec: rec.provider }), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  const first = make();
  const app = createAppServer(first);
  const { port } = await app.listen(0);
  const call = (method, path, body) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject);
    rq.end(body ? JSON.stringify(body) : undefined);
  });
  // 검사가 실패해도 서버를 닫아 검사 프로그램이 멈추지 않게 한다(2026-11-14 변이 검사 중 멈춤 발견).
  try {
    assert.deepEqual((await call('GET', '/api/chat/settings')).json, { fast: true, autoThink: true, lowPower: false });
    const r = (await call('POST', '/api/chat', { provider: 'rec', question: '빠른 답' })).json;
    assert.equal(r.fast, true);
    assert.equal(rec.sent[0].think, false);
    assert.deepEqual((await call('PUT', '/api/chat/settings', { fast: false })).json, { fast: false, autoThink: true, lowPower: false });
    const slow = (await call('POST', '/api/chat', { provider: 'rec', question: '느린 답' })).json;
    assert.equal(slow.fast, false);
    assert.equal('think' in rec.sent[1], false);
    assert.equal((await call('PUT', '/api/chat/settings', { fast: 'yes' })).status, 400);
  } finally {
    await app.close();
    first.close();
  }

  // 사용자가 끈 값은 기본값(켬)보다 우선해 재시작 후에도 꺼져 있다
  const second = make();
  t.after(() => second.close());
  assert.equal(second.chatSettings.fast, false);
});

test('빠른 답: 처음 설치(설정 없음)에서는 켜져 있다', async (t) => {
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ rec: recorder().provider }), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  t.after(() => services.close());
  assert.equal(services.chatSettings.fast, true);
});

test('빠른 답은 외부 전송 승인 미션 내용에는 들어가지 않는다(승인 내용 그대로 보냄)', async (t) => {
  const sent = [];
  const cloud = {
    name: 'cloud',
    describe: () => ({ name: 'cloud', baseUrl: 'https://cloud.example', model: 'm', remote: true }),
    async *stream(request) { sent.push(request); yield { type: 'done', finishReason: 'stop' }; },
  };
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ cloud }), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  t.after(() => services.close());
  const m = services.memory.add('기억');
  const r = await services.chat.ask({ provider: 'cloud', question: 'q', memoryIds: [m.id], fast: true });
  assert.equal(r.status, 'approval_required');
  assert.equal('think' in r.mission.content, false);
  services.missions.approve(r.mission.id, r.mission.content_version);
  await services.missions.execute(r.mission.id);
  assert.deepEqual(sent[0], r.preview.request);
});

test('자동 생각: 빠른 답이어도 계산 질문은 think:true, 일상 질문은 think:false, 끄면 모두 빠른 답', async (t) => {
  const rec = recorder();
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ rec: rec.provider }), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  t.after(() => services.close());
  assert.equal(services.chatSettings.autoThink, true);
  const math = await services.chat.ask({ provider: 'rec', question: '어떤 수를 4로 나누면 몫이 7이고 나머지가 3이야. 그 수는?', fast: true, autoThink: true });
  assert.equal(rec.sent[0].think, true);
  assert.deepEqual(math.thinking, { mode: 'auto-think', reason: '계산 낱말' });
  const casual = await services.chat.ask({ provider: 'rec', question: '오늘 날씨 어때?', fast: true, autoThink: true });
  assert.equal(rec.sent[1].think, false);
  assert.equal(casual.thinking.mode, 'fast');
  await services.chat.ask({ provider: 'rec', question: '17 곱하기 23은?', fast: true, autoThink: false });
  assert.equal(rec.sent[2].think, false);
  await services.chat.ask({ provider: 'rec', question: '17 곱하기 23은?', fast: false, autoThink: true });
  assert.equal('think' in rec.sent[3], false);
});

test('화면 API: 자동 생각 설정 기본 켬, 따로 끄고 켜기, 잘못된 값 거부', async (t) => {
  const rec = recorder();
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ rec: rec.provider }), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const call = (method, path, body) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject);
    rq.end(body ? JSON.stringify(body) : undefined);
  });
  assert.deepEqual((await call('GET', '/api/chat/settings')).json, { fast: true, autoThink: true, lowPower: false });
  const r = (await call('POST', '/api/chat', { provider: 'rec', question: '35 * 12 계산해 줘' })).json;
  assert.equal(r.thinking.mode, 'auto-think');
  assert.equal(rec.sent[0].think, true);
  assert.deepEqual((await call('PUT', '/api/chat/settings', { autoThink: false })).json, { fast: true, autoThink: false, lowPower: false });
  await call('POST', '/api/chat', { provider: 'rec', question: '35 * 12 계산해 줘' });
  assert.equal(rec.sent[1].think, false);
  assert.equal((await call('PUT', '/api/chat/settings', { autoThink: 'yes' })).status, 400);
  assert.equal((await call('PUT', '/api/chat/settings', {})).status, 400);
});
