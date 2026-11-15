// 메인 화면 AI 고르기(2026-11-15): Llama(llama.cpp) 공급자, 쓸 수 있는지 알림, Ollama 모델 목록. 실제 외부 전송 없음(가짜 fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpProviders, readiness, PROVIDER_LABELS } from '../src/providers/adapters.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { PROVIDER_NAMES } from '../src/providers/contract.js';

const sse = (...chunks) => new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
const req = { messages: [{ role: 'user', content: '안녕' }] };

test('공급자 다섯: Claude·Codex(OpenAI)·Grok·로컬(Ollama)·Llama, 화면 이름이 있다', () => {
  assert.deepEqual(PROVIDER_NAMES, ['openai', 'claude', 'grok', 'ollama', 'llama']);
  for (const n of PROVIDER_NAMES) assert.ok(PROVIDER_LABELS[n], n);
  assert.equal(PROVIDER_LABELS.openai, 'Codex(OpenAI)');
});

test('쓸 수 있는지: 키·모델·외부 전송 설정을 네트워크 없이 보고, 키 값은 내보내지 않는다', () => {
  assert.deepEqual(readiness('claude', {}), { ready: false, reason: '외부 전송이 꺼져 있음(JARVIS_ALLOW_REMOTE=1 필요)' });
  assert.match(readiness('claude', { JARVIS_ALLOW_REMOTE: '1' }).reason, /ANTHROPIC_API_KEY/);
  assert.deepEqual(readiness('claude', { JARVIS_ALLOW_REMOTE: '1', ANTHROPIC_API_KEY: 'sk-ant-secret-value' }), { ready: true, reason: '' });
  assert.match(readiness('openai', { JARVIS_ALLOW_REMOTE: '1', OPENAI_API_KEY: 'k' }).reason, /JARVIS_OPENAI_MODEL/);
  assert.equal(readiness('ollama', { JARVIS_OLLAMA_MODEL: 'gemma4:12b' }).ready, true);
  assert.equal(readiness('llama', {}).ready, true, 'llama-server 기본: 이 PC 127.0.0.1:8080, 키 없음');
  const p = createHttpProviders({ env: { ANTHROPIC_API_KEY: 'sk-ant-secret-value', JARVIS_ALLOW_REMOTE: '1' } });
  const d = p.claude.describe();
  assert.equal(d.label, 'Claude');
  assert.equal(d.ready, true);
  assert.equal(JSON.stringify(d).includes('secret'), false);
  // 설정 없는 자리 표시자는 고를 수 없음
  assert.equal(new ProviderRegistry().describe('claude').ready, false);
});

test('Llama(llama.cpp): OpenAI 호환 /chat/completions, 키 머리글 없이, 이 PC 주소로만', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url: String(url), opts }); return sse({ choices: [{ delta: { content: '안녕하세요' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }); };
  const reg = new ProviderRegistry(createHttpProviders({ env: {}, fetchImpl }));
  const out = await reg.collect('llama', req);
  assert.equal(out.text, '안녕하세요');
  assert.equal(calls[0].url, 'http://127.0.0.1:8080/v1/chat/completions');
  assert.equal(calls[0].opts.headers.authorization, undefined);
  assert.equal(JSON.parse(calls[0].opts.body).model, 'local');
  assert.equal(reg.describe('llama').remote, false);
  // 외부 주소로 바꾸면 외부 전송 허용 전에는 안 보냄
  const far = new ProviderRegistry(createHttpProviders({ env: { JARVIS_LLAMA_BASE_URL: 'https://llama.example/v1' }, fetchImpl }));
  await assert.rejects(far.collect('llama', req), { code: 'not_configured' });
});

test('Ollama 모델 목록: 이 PC Ollama의 /api/tags만, 실패하면 빈 목록', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(String(url)); return new Response(JSON.stringify({ models: [{ name: 'gemma4:12b', size: 8e9, details: { family: 'gemma4' } }, { name: 'llama3.2:3b', size: 2e9, details: { family: 'llama' } }] }), { status: 200 }); };
  const p = createHttpProviders({ env: {}, fetchImpl });
  assert.deepEqual((await p.ollama.models()).map((m) => m.name), ['gemma4:12b', 'llama3.2:3b']);
  assert.equal(urls[0], 'http://127.0.0.1:11434/api/tags');
  const remote = createHttpProviders({ env: { JARVIS_OLLAMA_BASE_URL: 'http://10.0.0.5:11434' }, fetchImpl });
  assert.deepEqual(await remote.ollama.models(), [], '외부 Ollama 주소는 묻지 않음');
  const broken = createHttpProviders({ env: {}, fetchImpl: async () => { throw new Error('down'); } });
  assert.deepEqual(await broken.ollama.models(), []);
});
