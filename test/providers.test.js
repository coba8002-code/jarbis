import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider } from '../src/providers/mock.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { PROVIDER_NAMES } from '../src/providers/contract.js';

const req = { messages: [{ role: 'user', content: '안녕' }] };

test('모의 공급자: 조각이 순서대로 오고 끝 신호가 온다', async () => {
  const p = createMockProvider('mock', { chunks: ['가', '나', '다'] });
  const events = [];
  for await (const ev of p.stream(req)) events.push(ev);
  assert.deepEqual(events, [
    { type: 'delta', text: '가' }, { type: 'delta', text: '나' }, { type: 'delta', text: '다' },
    { type: 'done', finishReason: 'stop' },
  ]);
});

test('취소 후에는 조각이 더 오지 않는다', async () => {
  const p = createMockProvider('mock', { chunks: ['1', '2', '3', '4', '5'], delayMs: 5 });
  const ac = new AbortController();
  const got = [];
  await assert.rejects(async () => {
    for await (const ev of p.stream(req, { signal: ac.signal })) {
      got.push(ev);
      if (got.length === 2) ac.abort();
    }
  }, { code: 'cancelled' });
  assert.equal(got.length, 2);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(got.length, 2);
});

test('이미 취소된 요청은 조각 없이 cancelled', async () => {
  const ac = new AbortController();
  ac.abort();
  const reg = new ProviderRegistry({ mock: createMockProvider() });
  const deltas = [];
  await assert.rejects(reg.collect('mock', req, { signal: ac.signal, onDelta: (d) => deltas.push(d) }), { code: 'cancelled' });
  assert.equal(deltas.length, 0);
});

test('오류는 분류되고 다른 공급자로 자동 전송되지 않는다', async () => {
  const calls = [];
  const spy = (name) => ({ name, async *stream() { calls.push(name); yield { type: 'done', finishReason: 'stop' }; } });
  const reg = new ProviderRegistry({
    mock: createMockProvider('mock', { failWith: 'rate_limit', failAfter: 1 }),
    backup: spy('backup'),
  });
  await assert.rejects(reg.collect('mock', req), (e) => e.code === 'rate_limit' && e.provider === 'mock');
  assert.deepEqual(calls, []);
});

test('네 공급자 자리 표시자는 네트워크 없이 not_configured', async () => {
  const reg = new ProviderRegistry();
  assert.deepEqual(reg.names(), PROVIDER_NAMES);
  for (const name of PROVIDER_NAMES) {
    await assert.rejects(reg.collect(name, req), (e) => e.code === 'not_configured' && e.provider === name);
  }
  await assert.rejects(reg.collect('nope', req), { code: 'not_configured' });
});

test('잘못된 요청은 bad_request', async () => {
  const reg = new ProviderRegistry({ mock: createMockProvider() });
  await assert.rejects(reg.collect('mock', { messages: [] }), { code: 'bad_request' });
  await assert.rejects(reg.collect('mock', { messages: [{ role: 'x', content: 'a' }] }), { code: 'bad_request' });
});

test('collect는 전체 글을 모은다', async () => {
  const reg = new ProviderRegistry({ mock: createMockProvider('mock', { chunks: ['안녕', '하세요'] }) });
  assert.deepEqual(await reg.collect('mock', req), { provider: 'mock', text: '안녕하세요', finishReason: 'stop' });
});
