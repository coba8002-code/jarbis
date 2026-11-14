// 생각(think)을 모르는 Ollama 모델(gemma3 등): 400 "does not support thinking"이면 think 없이 한 번 다시 보내고 기억한다(2026-11-15).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHttpProviders } from '../src/providers/adapters.js';

let server;
let base;
const seen = [];
before(async () => {
  server = createServer((rq, rs) => {
    let text = '';
    rq.on('data', (c) => { text += c; });
    rq.on('end', () => {
      const body = JSON.parse(text);
      seen.push(body);
      if ('think' in body) { rs.writeHead(400, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ error: `"${body.model}" does not support thinking` })); return; }
      rs.writeHead(200, { 'content-type': 'application/x-ndjson' });
      rs.end(`${JSON.stringify({ message: { content: '다섯' } })}\n${JSON.stringify({ message: { content: '' }, done: true, done_reason: 'stop' })}\n`);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

async function collect(p, request) {
  const out = [];
  for await (const ev of p.stream(request)) { if (ev.type === 'delta') out.push(ev.text); else return out; }
  return out;
}

test('think를 모르는 모델은 think 없이 다시 보내 답을 받고, 다음부터는 처음부터 빼고 보낸다', async () => {
  const p = createHttpProviders({ env: { JARVIS_OLLAMA_BASE_URL: base, JARVIS_OLLAMA_MODEL: 'gemma3:4b' } });
  const request = { messages: [{ role: 'user', content: '2+3?' }], think: false };
  assert.deepEqual(await collect(p.ollama, request), ['다섯']);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].think, false);
  assert.equal('think' in seen[1], false);
  seen.length = 0;
  assert.deepEqual(await collect(p.ollama, request), ['다섯']);
  assert.equal(seen.length, 1);
  assert.equal('think' in seen[0], false);
});

test('think를 정하지 않은 요청은 다시 보내지 않는다(다른 400은 그대로 실패)', async () => {
  const p = createHttpProviders({ env: { JARVIS_OLLAMA_BASE_URL: base, JARVIS_OLLAMA_MODEL: 'other' } });
  seen.length = 0;
  assert.deepEqual(await collect(p.ollama, { messages: [{ role: 'user', content: '안녕' }] }), ['다섯']);
  assert.equal(seen.length, 1);
});
