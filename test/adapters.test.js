// 네 공급자 어댑터 검사. 실제 API에는 보내지 않는다.
// 127.0.0.1의 가짜 서버나 가짜 fetch만 쓴다. 키는 검사용 가짜 문자열이다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHttpProviders } from '../src/providers/adapters.js';
import { ProviderRegistry } from '../src/providers/registry.js';

const FAKE_KEY = 'test-key-not-real-000';
const req = { messages: [{ role: 'system', content: '짧게 답해' }, { role: 'user', content: '안녕' }] };

let server;
let base;
let seen = [];
let route = () => {};

before(async () => {
  server = createServer((rq, rs) => {
    let body = '';
    rq.on('data', (c) => { body += c; });
    rq.on('end', () => {
      seen.push({ method: rq.method, url: rq.url, headers: rq.headers, body: body ? JSON.parse(body) : null });
      route(rq, rs);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

function reset(handler) {
  seen = [];
  route = handler;
}

// 조각을 나눠 보내서 줄 나눔 처리도 검사한다.
function writeSlowly(rs, parts, delay = 5) {
  let i = 0;
  const tick = () => {
    if (rs.destroyed) return;
    if (i >= parts.length) { rs.end(); return; }
    rs.write(parts[i]);
    i += 1;
    setTimeout(tick, delay);
  };
  tick();
}

function sse(rs, events, delay) {
  rs.writeHead(200, { 'content-type': 'text/event-stream' });
  const text = events.map((e) => (e.event ? `event: ${e.event}\n` : '') + `data: ${e.data}\n\n`).join('');
  const parts = [];
  for (let i = 0; i < text.length; i += 7) parts.push(text.slice(i, i + 7));
  writeSlowly(rs, parts, delay ?? 0);
}

async function collect(provider, opts = {}) {
  const deltas = [];
  for await (const ev of provider.stream(opts.request ?? req, { signal: opts.signal })) {
    if (ev.type === 'delta') deltas.push(ev.text);
    else return { deltas, done: ev };
  }
  return { deltas, done: null };
}

function envFor(extra = {}) {
  return {
    OPENAI_API_KEY: FAKE_KEY,
    ANTHROPIC_API_KEY: FAKE_KEY,
    XAI_API_KEY: FAKE_KEY,
    JARVIS_OPENAI_BASE_URL: `${base}/v1`,
    JARVIS_GROK_BASE_URL: `${base}/xai/v1`,
    JARVIS_CLAUDE_BASE_URL: base,
    JARVIS_OLLAMA_BASE_URL: base,
    JARVIS_OPENAI_MODEL: 'test-model',
    JARVIS_GROK_MODEL: 'test-grok',
    JARVIS_OLLAMA_MODEL: 'test-llama',
    ...extra,
  };
}

const openAiEvents = [
  { data: JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] }) },
  { data: JSON.stringify({ choices: [{ delta: { content: '안녕' } }] }) },
  { data: JSON.stringify({ choices: [{ delta: { content: '하세요' }, finish_reason: 'stop' }] }) },
  { data: '[DONE]' },
];

test('기본 설정은 외부 주소로 보내지 않는다 (fetch 호출 0회)', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('호출되면 안 됨'); };
  const env = { OPENAI_API_KEY: FAKE_KEY, ANTHROPIC_API_KEY: FAKE_KEY, XAI_API_KEY: FAKE_KEY, JARVIS_OPENAI_MODEL: 'm', JARVIS_GROK_MODEL: 'm' };
  const p = createHttpProviders({ env, fetchImpl });
  for (const name of ['openai', 'claude', 'grok']) {
    await assert.rejects(collect(p[name]), (e) => e.code === 'not_configured' && /외부 전송 승인/.test(e.message), name);
  }
  assert.equal(calls, 0);
});

test('키·모델이 없으면 네트워크 없이 not_configured', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('x'); };
  const p = createHttpProviders({ env: { JARVIS_OPENAI_BASE_URL: `${base}/v1`, JARVIS_OPENAI_MODEL: 'm', JARVIS_OLLAMA_BASE_URL: base }, fetchImpl });
  await assert.rejects(collect(p.openai), (e) => e.code === 'not_configured' && /OPENAI_API_KEY/.test(e.message));
  await assert.rejects(collect(p.ollama), (e) => e.code === 'not_configured' && /JARVIS_OLLAMA_MODEL/.test(e.message));
  assert.equal(calls, 0);
});

test('외부 전송을 명시 허용하면 지정한 주소로만 보낸다 (가짜 fetch)', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return new Response('no', { status: 401 }); };
  const env = { OPENAI_API_KEY: FAKE_KEY, JARVIS_OPENAI_MODEL: 'm', JARVIS_ALLOW_REMOTE: '1' };
  const p = createHttpProviders({ env, fetchImpl });
  await assert.rejects(collect(p.openai), { code: 'auth' });
  assert.deepEqual(urls, ['https://api.openai.com/v1/chat/completions']);
});

test('OpenAI 형식: 요청 모양과 스트리밍', async () => {
  reset((rq, rs) => sse(rs, openAiEvents));
  const p = createHttpProviders({ env: envFor() });
  const out = await collect(p.openai);
  assert.deepEqual(out.deltas, ['안녕', '하세요']);
  assert.deepEqual(out.done, { type: 'done', finishReason: 'stop' });
  assert.equal(seen[0].url, '/v1/chat/completions');
  assert.equal(seen[0].headers.authorization, `Bearer ${FAKE_KEY}`);
  assert.deepEqual(seen[0].body, { model: 'test-model', messages: req.messages, stream: true });
});

test('Grok: OpenAI 호환 형식, 자기 주소와 키 사용', async () => {
  reset((rq, rs) => sse(rs, openAiEvents));
  const p = createHttpProviders({ env: envFor() });
  const out = await collect(p.grok);
  assert.deepEqual(out.deltas, ['안녕', '하세요']);
  assert.equal(seen[0].url, '/xai/v1/chat/completions');
  assert.equal(seen[0].body.model, 'test-grok');
});

test('Claude 형식: 헤더, system 분리, SSE 이벤트', async () => {
  reset((rq, rs) => sse(rs, [
    { event: 'message_start', data: JSON.stringify({ type: 'message_start', message: { id: 'msg_1' } }) },
    { event: 'content_block_start', data: JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) },
    { event: 'ping', data: JSON.stringify({ type: 'ping' }) },
    { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '반가' } }) },
    { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '워요' } }) },
    { event: 'content_block_stop', data: JSON.stringify({ type: 'content_block_stop', index: 0 }) },
    { event: 'message_delta', data: JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) },
    { event: 'message_stop', data: JSON.stringify({ type: 'message_stop' }) },
  ]));
  const p = createHttpProviders({ env: envFor() });
  const out = await collect(p.claude);
  assert.deepEqual(out.deltas, ['반가', '워요']);
  assert.deepEqual(out.done, { type: 'done', finishReason: 'end_turn' });
  const s = seen[0];
  assert.equal(s.url, '/v1/messages');
  assert.equal(s.headers['x-api-key'], FAKE_KEY);
  assert.equal(s.headers['anthropic-version'], '2026-10-21');
  assert.equal(s.body.model, 'claude-opus-5-5');
  assert.equal(s.body.system, '짧게 답해');
  assert.deepEqual(s.body.messages, [{ role: 'user', content: '안녕' }]);
  assert.equal(s.body.stream, true);
});

test('Claude: 스트림 중 오류와 거절을 분류한다', async () => {
  const p = createHttpProviders({ env: envFor() });
  reset((rq, rs) => sse(rs, [
    { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'a' } }) },
    { event: 'error', data: JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }) },
  ]));
  await assert.rejects(collect(p.claude), { code: 'unavailable' });

  reset((rq, rs) => sse(rs, [
    { event: 'message_delta', data: JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'refusal' } }) },
    { event: 'message_stop', data: JSON.stringify({ type: 'message_stop' }) },
  ]));
  await assert.rejects(collect(p.claude), { code: 'refused' });
});

test('Ollama: NDJSON 스트리밍과 모델 없음', async () => {
  const p = createHttpProviders({ env: envFor() });
  reset((rq, rs) => {
    rs.writeHead(200, { 'content-type': 'application/x-ndjson' });
    writeSlowly(rs, [
      `${JSON.stringify({ message: { role: 'assistant', content: '로컬' } })}\n${JSON.stringify({ message: { content: ' 응답' } })}`,
      `\n${JSON.stringify({ message: { content: '' }, done: true, done_reason: 'stop' })}\n`,
    ]);
  });
  const out = await collect(p.ollama);
  assert.deepEqual(out.deltas, ['로컬', ' 응답']);
  assert.equal(out.done.finishReason, 'stop');
  assert.equal(seen[0].url, '/api/chat');
  assert.equal(seen[0].headers.authorization, undefined);
  assert.equal(seen[0].body.model, 'test-llama');

  reset((rq, rs) => { rs.writeHead(404); rs.end(JSON.stringify({ error: "model 'test-llama' not found" })); });
  await assert.rejects(collect(p.ollama), (e) => e.code === 'not_found' && /not found/.test(e.message));
});

test('Ollama 서버가 없으면 unavailable', async () => {
  const closed = createServer();
  await new Promise((r) => closed.listen(0, '127.0.0.1', r));
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  const p = createHttpProviders({ env: { JARVIS_OLLAMA_BASE_URL: `http://127.0.0.1:${port}`, JARVIS_OLLAMA_MODEL: 'm' } });
  await assert.rejects(collect(p.ollama), (e) => e.code === 'unavailable' && /연결 실패/.test(e.message));
});

test('HTTP 상태 코드를 분류하고 오류 문구에 키를 남기지 않는다', async () => {
  const p = createHttpProviders({ env: envFor() });
  const cases = [[401, 'auth'], [403, 'auth'], [404, 'not_found'], [400, 'bad_request'], [429, 'rate_limit'], [500, 'unavailable'], [529, 'unavailable']];
  for (const [status, code] of cases) {
    reset((rq, rs) => { rs.writeHead(status); rs.end(`bad key ${FAKE_KEY}`); });
    await assert.rejects(collect(p.openai), (e) => {
      assert.equal(e.code, code, String(status));
      assert.ok(!e.message.includes(FAKE_KEY), '키가 오류 문구에 남음');
      assert.match(e.message, /\[REDACTED\]/);
      return true;
    });
  }
});

test('취소하면 이후 조각이 오지 않는다', async () => {
  reset((rq, rs) => {
    rs.writeHead(200, { 'content-type': 'text/event-stream' });
    const parts = ['가', '나', '다', '라', '마'].map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
    writeSlowly(rs, [...parts, 'data: [DONE]\n\n'], 20);
  });
  const p = createHttpProviders({ env: envFor() });
  const ac = new AbortController();
  const got = [];
  await assert.rejects(async () => {
    for await (const ev of p.openai.stream(req, { signal: ac.signal })) {
      got.push(ev);
      if (got.length === 1) ac.abort();
    }
  }, { code: 'cancelled' });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(got.length, 1);
});

test('실패해도 다른 공급자로 자동 전송하지 않는다', async () => {
  reset((rq, rs) => { rs.writeHead(500); rs.end('down'); });
  const reg = ProviderRegistry.fromEnv({ env: envFor() });
  await assert.rejects(reg.collect('openai', req), { code: 'unavailable' });
  assert.deepEqual(seen.map((s) => s.url), ['/v1/chat/completions']);
});

test('끝 신호 없이 끊기면 internal', async () => {
  reset((rq, rs) => sse(rs, openAiEvents.slice(0, 2)));
  const p = createHttpProviders({ env: envFor() });
  await assert.rejects(collect(p.openai), { code: 'internal' });
});
