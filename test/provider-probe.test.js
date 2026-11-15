// Llama·Ollama가 실제로 켜져 있는지 보기(2026-11-15). 가짜 fetch만 쓴다(네트워크 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpProviders, describeLive } from '../src/providers/adapters.js';
import { ProviderRegistry } from '../src/providers/registry.js';

const env = { JARVIS_OLLAMA_MODEL: 'gemma4:12b' };

test('llama-server가 꺼져 있으면 "쓸 수 없음"과 이유, 켜져 있으면 그대로', async () => {
  const asked = [];
  let llamaUp = false;
  const fetchImpl = async (url) => {
    asked.push(String(url));
    if (String(url).includes(':8080')) { if (!llamaUp) throw new TypeError('fetch failed'); return new Response('{"data":[]}', { status: 200 }); }
    return new Response('{"models":[]}', { status: 200 });
  };
  const reg = new ProviderRegistry(createHttpProviders({ env, fetchImpl }));
  const list = await describeLive(reg);
  const llama = list.find((p) => p.name === 'llama');
  assert.equal(llama.ready, false);
  assert.match(llama.reason, /llama-server가 켜져 있지 않음\(127\.0\.0\.1:8080\)/);
  assert.equal(list.find((p) => p.name === 'ollama').ready, true);
  assert.ok(asked.includes('http://127.0.0.1:8080/v1/models'));
  assert.ok(asked.includes('http://127.0.0.1:11434/api/tags'));
  // 외부 AI(Claude 등)는 묻지 않는다
  assert.ok(asked.every((u) => u.startsWith('http://127.0.0.1')));
  // 15초 동안은 다시 묻지 않는다(캐시)
  llamaUp = true;
  const n = asked.length;
  assert.equal((await describeLive(reg)).find((p) => p.name === 'llama').ready, false);
  assert.equal(asked.length, n);
  // 새로 만들면(캐시 없음) 켜진 것으로 보인다
  const reg2 = new ProviderRegistry(createHttpProviders({ env, fetchImpl }));
  assert.equal((await describeLive(reg2)).find((p) => p.name === 'llama').ready, true);
});

test('Ollama가 꺼져 있거나 HTTP 오류면 이유를 알려 주고, 외부 주소면 묻지 않는다', async () => {
  const down = new ProviderRegistry(createHttpProviders({ env, fetchImpl: async () => { throw new TypeError('fetch failed'); } }));
  const o = (await describeLive(down)).find((p) => p.name === 'ollama');
  assert.equal(o.ready, false);
  assert.match(o.reason, /Ollama가 켜져 있지 않음/);
  const err = new ProviderRegistry(createHttpProviders({ env, fetchImpl: async () => new Response('x', { status: 500 }) }));
  assert.match((await describeLive(err)).find((p) => p.name === 'llama').reason, /HTTP 500/);
  // 같은 포트에 다른 프로그램(웹 페이지)이 있으면 켜진 것으로 보지 않는다
  const other = new ProviderRegistry(createHttpProviders({ env, fetchImpl: async (u) => (String(u).includes(':8080') ? new Response('<!doctype html><title>Open WebUI</title>', { status: 200 }) : new Response('{"models":[]}', { status: 200 })) }));
  const ol = (await describeLive(other)).find((p) => p.name === 'llama');
  assert.equal(ol.ready, false);
  assert.match(ol.reason, /127\.0\.0\.1:8080에 llama-server가 아닌 다른 프로그램이 있음/);
  let asked = 0;
  const remote = new ProviderRegistry(createHttpProviders({ env: { ...env, JARVIS_LLAMA_BASE_URL: 'https://llama.example/v1', JARVIS_ALLOW_REMOTE: '1' }, fetchImpl: async () => { asked += 1; throw new Error('x'); } }));
  const l = (await describeLive(remote)).find((p) => p.name === 'llama');
  assert.equal(l.ready, true);
  assert.equal(asked, 1); // Ollama(이 PC)만 물음
});
