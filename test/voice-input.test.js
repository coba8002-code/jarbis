// 발화 감지(말소리 구간 판단)와 화면 정적 스크립트 제공 검사. 마이크 없이 소리 크기 값만 넣는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { createSegmenter, rmsOf } from '../src/server/public/voice-input.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

// [소리 크기, 지속 ms] 목록을 50ms 간격으로 넣고 사건을 모은다.
function feed(seg, plan, step = 50) {
  const events = [];
  let t = 0;
  for (const [rms, ms] of plan) {
    for (let x = 0; x < ms; x += step) {
      const ev = seg.push(rms, t);
      if (ev) events.push([ev, t]);
      t += step;
    }
  }
  return events;
}

test('조용함 → 말소리 → 조용함: 시작과 끝을 한 번씩 알린다', () => {
  const seg = createSegmenter();
  const ev = feed(seg, [[0.002, 1000], [0.2, 1500], [0.002, 2000]]);
  assert.deepEqual(ev.map(([e]) => e), ['start', 'end']);
  assert.ok(ev[0][1] >= 1150 && ev[0][1] <= 1250, `시작 ${ev[0][1]}ms`);
  assert.ok(ev[1][1] >= 2500 + 1150 && ev[1][1] <= 2500 + 1300, `끝 ${ev[1][1]}ms`);
});

test('짧은 소리(딸깍, 100ms)는 말로 보지 않는다', () => {
  const seg = createSegmenter();
  assert.deepEqual(feed(seg, [[0.002, 500], [0.5, 100], [0.002, 2000]]), []);
});

test('말 사이 짧은 쉼(0.5초)에는 끝내지 않는다', () => {
  const seg = createSegmenter();
  const ev = feed(seg, [[0.2, 1000], [0.002, 500], [0.2, 1000], [0.002, 1500]]);
  assert.deepEqual(ev.map(([e]) => e), ['start', 'end']);
});

test('계속 말하면 최대 길이에서 끊는다', () => {
  const seg = createSegmenter({ maxMs: 3000 });
  const ev = feed(seg, [[0.2, 5000]]);
  assert.deepEqual(ev.map(([e]) => e).slice(0, 2), ['start', 'end']);
  assert.ok(ev[1][1] <= 3300);
});

test('시끄러운 방에서는 기준이 올라가 배경 소음만으로는 시작하지 않는다', () => {
  // 기준(0.02)보다 작은 꾸준한 소음으로 바닥값을 배우면, 그보다 조금 큰 소음(0.03)으로는 시작하지 않는다.
  const seg = createSegmenter();
  feed(seg, [[0.012, 3000]]);
  assert.ok(seg.level() > 0.03, `배운 기준 ${seg.level()}`);
  assert.deepEqual(feed(seg, [[0.03, 2000]]), []);
  assert.deepEqual(feed(seg, [[0.3, 1000]]).map(([e]) => e), ['start']);
});

test('reset하면 진행 중인 말 구간을 버린다', () => {
  const seg = createSegmenter();
  feed(seg, [[0.2, 400]]);
  assert.equal(seg.speaking, true);
  seg.reset();
  assert.equal(seg.speaking, false);
});

test('소리 크기 계산', () => {
  assert.equal(rmsOf(new Float32Array([0, 0, 0])), 0);
  assert.ok(Math.abs(rmsOf(new Float32Array([0.5, -0.5])) - 0.5) < 1e-6);
  assert.equal(rmsOf(new Float32Array([])), 0);
});

test('화면: 발화 감지 스크립트를 토큰 없이 내보내고, 마이크는 이 화면에서만 허용', async (t) => {
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const get = (path, host) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, headers: host ? { host } : {} }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, headers: rs.headers, text }));
    });
    rq.on('error', reject);
    rq.end();
  });
  const js = await get('/static/voice-input.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /text\/javascript/);
  assert.match(js.text, /export function createSegmenter/);
  assert.equal((await get('/static/voice-input.js', 'evil.example')).status, 421);
  assert.equal((await get('/static/../server.js')).status, 404);
  assert.equal((await get('/static/other.js')).status, 404);
  const page = await get('/');
  assert.match(page.headers['content-security-policy'], /script-src 'self' 'unsafe-inline'/);
  assert.equal(page.headers['permissions-policy'], 'microphone=(self), camera=(), geolocation=()');
  assert.match(page.text, /id="mic-btn"/);
  assert.match(page.text, /id="mic-indicator"[^>]*hidden/);
  // hidden 속성이 .badge의 display 지정에 덮이지 않아야 녹음 중 표시가 녹음할 때만 보인다(2026-11-14 결함).
  assert.match(page.text, /\[hidden\] \{ display: none !important; \}/);
});
