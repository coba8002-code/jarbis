// 끄기 순서(2026-11-14 독립 QA 결함): 진행 중인 답 생성·미리 듣기·받아쓰기를 먼저 끊고, 화면 서버를 제한 시간 안에 닫은 뒤
// 마지막에 DB를 닫는다. 가짜 공급자·가짜 스피커·가짜 받아쓰기 서버만 쓴다(소리·외부 전송 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { shutdown } from '../src/app/shutdown.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { SpeechToText } from '../src/voice/stt.js';
import { tempDbPath } from './helpers.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// waitsForAbort: 취소 신호가 올 때까지 아무것도 보내지 않는 공급자. ignoresAbort: 취소를 무시하고 끝나지 않는 공급자.
function providers(stats) {
  const describe = (name) => () => ({ name, baseUrl: 'http://127.0.0.1:1', model: null, remote: false });
  return new ProviderRegistry({
    waitsForAbort: {
      name: 'waitsForAbort',
      describe: describe('waitsForAbort'),
      async *stream(req, { signal } = {}) {
        stats.started += 1;
        await new Promise((resolve, reject) => signal.addEventListener('abort', () => {
          stats.aborted += 1;
          reject(Object.assign(new Error('취소됨'), { name: 'ProviderError', code: 'cancelled' }));
        }, { once: true }));
      },
    },
    // 외부 공급자 흉내(실제 전송 없음): 승인한 전송 미션 실행 중 끄기 검사용
    remoteWaits: {
      name: 'remoteWaits',
      describe: () => ({ name: 'remoteWaits', baseUrl: 'https://example.invalid', model: 'm', remote: true }),
      async *stream(req, { signal } = {}) {
        stats.started += 1;
        await new Promise((resolve, reject) => signal.addEventListener('abort', () => {
          stats.aborted += 1;
          reject(Object.assign(new Error('취소됨'), { name: 'ProviderError', code: 'cancelled' }));
        }, { once: true }));
      },
    },
    ignoresAbort: {
      name: 'ignoresAbort',
      describe: describe('ignoresAbort'),
      async *stream() {
        stats.started += 1;
        await new Promise(() => {});
      },
    },
  });
}

async function start(t) {
  const stats = { started: 0, aborted: 0, killed: 0, sttStopped: 0, dbClosedAt: null };
  const speaker = { speak: () => { let done; const p = new Promise((r) => { done = r; }); return { done: p, kill() { stats.killed += 1; done({ killed: true }); } }; } };
  const stt = new SpeechToText({ launcher: async () => ({ baseUrl: 'http://127.0.0.1:1', stop() {} }) });
  stt.server = { baseUrl: 'http://127.0.0.1:1', stop() { stats.sttStopped += 1; }, isAlive: () => true }; // 떠 있는 받아쓰기 서버 흉내
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: providers(stats), speaker, stt });
  const close = services.close;
  services.close = () => { stats.dbClosedAt = performance.now(); close(); };
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { if (stats.dbClosedAt === null) { await app.close(); services.close(); } });
  const call = (method, path, body) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text), at: performance.now() }));
    });
    rq.on('error', reject);
    rq.end(body ? JSON.stringify(body) : undefined);
  });
  return { app, services, stats, call };
}

test('답 생성 중 끄기: 생성을 먼저 끊어 응답을 보낸 뒤 서버와 DB를 닫는다', async (t) => {
  const { app, services, stats, call } = await start(t);
  const chat = call('POST', '/api/chat', { provider: 'waitsForAbort', question: '긴 답' });
  while (!stats.started) await tick(1);
  const t0 = performance.now();
  await shutdown(app, services, { timeoutMs: 5000 });
  assert.ok(performance.now() - t0 < 1000, '취소를 기다리는 요청 때문에 멈추지 않아야 함');
  assert.equal(stats.aborted, 1);
  const r = await chat;
  assert.equal(r.status, 200);
  assert.equal(r.json.reply.finishReason, 'interrupted');
  assert.ok(r.at <= stats.dbClosedAt, 'DB는 응답을 보낸 뒤에 닫음');
  assert.equal(stats.sttStopped, 1, '받아쓰기 서버(자식 프로세스)도 끈다');
  assert.throws(() => services.db.prepare('SELECT 1').get());
});

test('취소를 무시하는 공급자여도 제한 시간이 지나면 남은 연결을 끊고 닫는다', async (t) => {
  const { app, services, stats, call } = await start(t);
  call('POST', '/api/chat', { provider: 'ignoresAbort', question: '끝나지 않는 답' }).catch(() => {});
  while (!stats.started) await tick(1);
  const t0 = performance.now();
  await shutdown(app, services, { timeoutMs: 200 });
  const ms = performance.now() - t0;
  assert.ok(ms >= 150 && ms < 1500, `제한 시간 안에 닫힘(${Math.round(ms)}ms)`);
  assert.notEqual(stats.dbClosedAt, null);
});

test('목소리 미리 듣기 중 끄기: 말하던 소리를 멈추고 닫는다', async (t) => {
  const { app, services, stats, call } = await start(t);
  const c = services.characters.create({ name: '시험', persona: '짧게 말함' });
  const preview = call('POST', `/api/characters/${c.id}/preview`);
  while (!services.voice.previewing) await tick(1);
  await shutdown(app, services, { timeoutMs: 5000 });
  assert.equal(stats.killed, 1);
  assert.equal((await preview).json.killed, true);
});

test('할 일이 없을 때 끄기도 바로 끝난다', async (t) => {
  const { app, services, stats } = await start(t);
  const t0 = performance.now();
  await shutdown(app, services);
  assert.ok(performance.now() - t0 < 500);
  assert.notEqual(stats.dbClosedAt, null);
});

test('승인한 전송 미션 실행 중 끄기: 실행을 멈춰 "중단"으로 기록한 뒤 DB를 닫는다', async (t) => {
  const { app, services, stats, call } = await start(t);
  const mem = services.memory.add('시험 기억', []);
  const asked = (await call('POST', '/api/chat', { provider: 'remoteWaits', question: '질문', memoryIds: [mem.id] })).json;
  assert.equal(asked.status, 'approval_required');
  const id = asked.mission.id;
  await call('POST', `/api/missions/${id}/approve`, { version: asked.mission.content_version });
  const run = call('POST', `/api/missions/${id}/run`);
  while (!stats.started) await tick(1);
  const t0 = performance.now();
  await shutdown(app, services, { timeoutMs: 5000 });
  assert.ok(performance.now() - t0 < 1000);
  const r = await run;
  assert.equal(r.json.status, 'interrupted');
  assert.match(r.json.error, /끄는 중/);
  assert.ok(r.at <= stats.dbClosedAt, '상태 기록·응답 뒤에 DB를 닫음');
});
