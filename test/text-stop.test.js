// 소리 읽기를 끈 글 대화도 "멈추기"로 답 생성을 끊는다(FR-002). 가짜 공급자만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// 조각을 천천히 보내고, 취소 신호 뒤에 보낸 조각 수를 센다.
function slowProvider() {
  const stats = { started: 0, sentAfterAbort: 0, aborted: 0 };
  return {
    stats,
    provider: {
      name: 'slow',
      describe: () => ({ name: 'slow', baseUrl: 'http://127.0.0.1:1', model: null, remote: false }),
      async *stream(req, { signal } = {}) {
        stats.started += 1;
        for (let i = 0; i < 20; i += 1) {
          await tick(15);
          if (signal?.aborted) {
            stats.aborted += 1;
            throw Object.assign(new Error('취소됨'), { name: 'ProviderError', code: 'cancelled' });
          }
          yield { type: 'delta', text: `조각${i} ` };
        }
        yield { type: 'done', finishReason: 'stop' };
      },
    },
  };
}

async function start(t) {
  const slow = slowProvider();
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ slow: slow.provider }), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
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
  return { call, slow, services, port, token: app.token };
}

test('소리 읽기 끈 대화: 멈추기를 누르면 생성을 끊고 옛 답 글을 돌려주지 않는다', async (t) => {
  const { call, slow } = await start(t);
  assert.equal((await call('GET', '/api/voice')).json.enabled, false);
  const chat = call('POST', '/api/chat', { provider: 'slow', question: '긴 답' });
  while (!slow.stats.started) await tick(1);
  await tick(40);
  const stop = (await call('POST', '/api/voice/stop')).json;
  assert.equal(stop.stoppedChats, 1);
  const r = await chat;
  assert.equal(r.status, 200);
  assert.equal(r.json.reply.finishReason, 'interrupted');
  assert.equal(r.json.reply.text, '');
  assert.equal(r.json.reply.discarded, true);
  assert.equal(slow.stats.aborted, 1);
});

test('동시에 진행 중인 글 대화 둘을 한 번에 멈춘다', async (t) => {
  const { call, slow } = await start(t);
  const a = call('POST', '/api/chat', { provider: 'slow', question: 'a' });
  const b = call('POST', '/api/chat', { provider: 'slow', question: 'b' });
  while (slow.stats.started < 2) await tick(1);
  assert.equal((await call('POST', '/api/voice/stop')).json.stoppedChats, 2);
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.json.reply.finishReason, 'interrupted');
  assert.equal(rb.json.reply.finishReason, 'interrupted');
});

test('멈출 대화가 없으면 아무것도 멈추지 않고, 이후 대화는 정상', async (t) => {
  const { call } = await start(t);
  const stop = (await call('POST', '/api/voice/stop')).json;
  assert.equal(stop.stoppedChats, 0);
  assert.equal(stop.stopped, null);
  const r = await call('POST', '/api/chat', { provider: 'slow', question: '정상' });
  assert.equal(r.json.reply.finishReason, 'stop');
  assert.match(r.json.reply.text, /조각19/);
});

// 2026-11-14 실제 실행 QA: 답을 기다리던 화면을 새로 고치거나 닫으면 서버가 버려진 답을 끝까지 만들어
// 다음 질문이 그만큼 늦었다(Ollama gemma4:12b, 짧은 질문 88초). 연결이 끊기면 생성도 끊어야 한다.
test('글 대화 중 화면이 연결을 끊으면(새로 고침·닫기) 생성도 끊는다', async (t) => {
  const { slow, services, port, token } = await start(t);
  const rq = httpRequest({ host: '127.0.0.1', port, path: '/api/chat', method: 'POST', headers: { 'x-jarvis-token': token, 'content-type': 'application/json' } });
  rq.on('error', () => {});
  rq.end(JSON.stringify({ provider: 'slow', question: '긴 답' }));
  while (!slow.stats.started) await tick(1);
  await tick(20);
  rq.destroy();
  for (let i = 0; i < 100 && !slow.stats.aborted; i += 1) await tick(5);
  assert.equal(slow.stats.aborted, 1);
  assert.equal(services.chat.stopAll(), 0);
});

// 독립 QA 추가 재현: 소리 읽기를 켠 대화(차례 관리자 경로)는 연결이 끊겨도 생성이 계속됐다.
test('소리 읽기 켠 대화 중 화면이 연결을 끊어도 그 차례 생성을 끊고 대기로 돌아간다', async (t) => {
  const { call, slow, services, port, token } = await start(t);
  assert.equal((await call('PUT', '/api/voice', { enabled: true })).json.enabled, true);
  const rq = httpRequest({ host: '127.0.0.1', port, path: '/api/chat', method: 'POST', headers: { 'x-jarvis-token': token, 'content-type': 'application/json' } });
  rq.on('error', () => {});
  rq.end(JSON.stringify({ provider: 'slow', question: '긴 답' }));
  while (!slow.stats.started) await tick(1);
  await tick(20);
  rq.destroy();
  for (let i = 0; i < 100 && !slow.stats.aborted; i += 1) await tick(5);
  assert.equal(slow.stats.aborted, 1);
  assert.equal(services.voice.turns.state, 'idle');
  assert.equal(services.voice.turns.history().at(-1).reason, 'client_gone');
});

test('끝난 대화는 멈추기 대상에 남지 않는다', async (t) => {
  const { call, services } = await start(t);
  await call('POST', '/api/chat', { provider: 'slow', question: '끝까지' });
  assert.equal(services.chat.stopAll(), 0);
});
