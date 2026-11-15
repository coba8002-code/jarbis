import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page = fs.readFileSync(new URL('../src/server/public/jarvis.html', import.meta.url), 'utf8');
const start = page.match(/async function micStart\(\) \{\s*if \(mic.opening[\s\S]*?finally \{ mic.opening = false; \}\s*\}/)?.[0];

test('마이크를 여는 중 여러 번 눌러도 하나만 연다', async () => {
  let release; let calls = 0;
  const pending = new Promise((r) => { release = r; });
  const ctx = vm.createContext({ mic: {}, micOpen: async () => { calls += 1; await pending; } });
  vm.runInContext(`${start}; this.start = micStart`, ctx);
  const p = ctx.start(); await ctx.start(); await ctx.start();
  assert.equal(calls, 1); release(); await p;
  assert.equal(ctx.mic.opening, false);
});

test('열기에 실패해도 다시 시도할 수 있다', async () => {
  let calls = 0;
  const ctx = vm.createContext({ mic: {}, micOpen: async () => { calls += 1; throw new Error('open fail'); } });
  vm.runInContext(`${start}; this.start = micStart`, ctx);
  await assert.rejects(ctx.start()); await assert.rejects(ctx.start());
  assert.equal(calls, 2); assert.equal(ctx.mic.opening, false);
});

test('이미 스트림이 열렸으면 또 열지 않는다', async () => {
  let calls = 0;
  const ctx = vm.createContext({ mic: { stream: {} }, micOpen: async () => { calls += 1; } });
  vm.runInContext(`${start}; this.start = micStart`, ctx);
  await ctx.start(); assert.equal(calls, 0);
});
