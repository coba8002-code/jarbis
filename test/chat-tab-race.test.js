// 대화 탭 느린 응답 경쟁(2026-11-14 독립 QA 결함): GET /api/providers가 늦을 때 대화→기억→대화를 빠르게 누르면
// 공급자 선택지가 5개→10개로 중복됐다. index.html의 실제 loadChat 코드를 작은 가짜 화면에서 돌려 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';

const html = readFileSync(new URL('../src/server/public/index.html', import.meta.url), 'utf8');
const pick = (re) => { const m = html.match(re); assert.ok(m, `index.html에서 찾지 못함: ${re}`); return m[0]; };
const source = [
  pick(/const generation = \{\};/),
  pick(/function ticket\(key\) \{[^\n]*\}/),
  pick(/let chatEdits = 0;/),
  pick(/async function loadChat\(\) \{[\s\S]*?\n\}/),
].join('\n');

const PROVIDERS = ['openai', 'claude', 'grok', 'ollama', 'mock'].map((name) => ({ name, remote: !['ollama', 'mock'].includes(name) }));

function page() {
  const select = {
    options: [],
    selected: '',
    get value() { return this.selected; },
    set value(v) { this.selected = this.options.some((o) => o.value === v) ? v : ''; },
    replaceChildren(...k) { this.options = k; if (!k.some((o) => o.value === this.selected)) this.selected = k[0]?.value ?? ''; },
    append(o) { this.options.push(o); if (this.options.length === 1) this.selected = o.value; },
  };
  const memories = { kids: [], replaceChildren(...k) { this.kids = k; } };
  const nodes = { '#chat-provider': select, '#chat-fast': { checked: false }, '#chat-autothink': { checked: false }, '#chat-memories': memories };
  const el = (tag, attrs = {}, ...kids) => {
    const n = { tag, kids: kids.flat(), value: attrs.value };
    if (tag === 'input') n.checked = attrs.checked !== undefined;
    return n;
  };
  const inputs = () => memories.kids.flatMap((l) => (l.kids ?? []).filter((k) => k.tag === 'input'));
  const document = { querySelectorAll: (q) => (q === '#chat-memories input:checked' ? inputs().filter((i) => i.checked) : []) };
  // 응답은 시험이 직접 풀어 준다(느린 응답 흉내). 어느 loadChat 호출의 요청인지는 비동기 문맥으로 안다.
  // answer(i) 뒤에 그 호출이 차례로 더 보내는 요청(옛 코드처럼 await 뒤에 보내는 것)도 바로 답한다(검사가 끝없이 기다리지 않게).
  const DATA = { '/api/providers': PROVIDERS, '/api/voice': { state: 'idle', enabled: false }, '/api/chat/settings': { fast: true, autoThink: true }, '/api/memories': [{ id: 1, content: '보리차' }] };
  const callOf = new AsyncLocalStorage();
  const released = new Set();
  const pending = [];
  const api = (method, path) => new Promise((resolve) => {
    const call = callOf.getStore();
    if (released.has(call)) resolve(DATA[path]); else pending.push({ call, path, resolve });
  });
  const answer = (i) => {
    released.add(i);
    for (const p of pending.filter((x) => x.call === i)) p.resolve(DATA[p.path]);
  };
  const ctx = { $: (s) => nodes[s], el, api, document, showVoice: () => {} };
  // edit: 설정 체크 상자 change 처리기가 하는 것과 같이 chatEdits를 늘린다
  const { loadChat, edit } = new Function(...Object.keys(ctx), `${source}\nreturn { loadChat, edit: () => { chatEdits += 1; } };`)(...Object.values(ctx));
  let calls = 0;
  const start = () => { const i = calls; calls += 1; return callOf.run(i, () => loadChat()); };
  return { select, memories, inputs, nodes, start, answer, edit };
}

test('느린 응답 사이 대화 탭을 다시 열어도 공급자 선택지가 중복되지 않는다', { timeout: 2000 }, async () => {
  const p = page();
  const first = p.start();
  const second = p.start();
  p.answer(1); await second; // 새 요청이 먼저 끝나고
  p.answer(0); await first; // 옛 요청이 늦게 끝남
  assert.deepEqual(p.select.options.map((o) => o.value), PROVIDERS.map((x) => x.name));
  assert.equal(p.select.value, 'ollama', '처음에는 이 기기 안 공급자');
});

test('기다리는 사이 바꾼 공급자·고른 기억·빠른 답 설정을 옛 응답이 덮지 않는다', { timeout: 2000 }, async () => {
  const p = page();
  await (async () => { const f = p.start(); p.answer(0); await f; })();
  const again = p.start();
  p.select.value = 'mock';
  p.inputs()[0].checked = true;
  p.nodes['#chat-fast'].checked = false;
  p.edit();
  p.answer(1); await again;
  assert.equal(p.select.value, 'mock');
  assert.equal(p.inputs()[0].checked, true);
  assert.equal(p.nodes['#chat-fast'].checked, false, '바꾸기 전 응답(fast:true)이 끈 값을 되돌리지 않음');
});

test('설정 체크 상자 처리기들이 바꾼 횟수(chatEdits)를 늘린다', () => {
  for (const id of ['chat-fast', 'chat-autothink', 'voice-enabled']) {
    assert.match(html, new RegExp(`\\$\\('#${id}'\\)\\.addEventListener\\('change', \\(e\\) => guard\\(async \\(\\) => \\{ chatEdits \\+= 1;`), id);
  }
});
