// 아침 브리핑 검사. 실제 모델 없이 기록하는 가짜 공급자를 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { createServices } from '../src/app/services.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { collectBriefing, buildBriefingRequest, tidy, dayOf } from '../src/briefing/briefing.js';
import { tempDbPath } from './helpers.js';

function writer(text, { remote = false } = {}) {
  const got = [];
  return {
    got,
    provider: {
      name: 'ollama',
      describe: () => ({ name: 'ollama', baseUrl: remote ? 'https://far.invalid' : 'http://127.0.0.1:11434', model: 'gemma4:12b', remote }),
      async *stream(request) { got.push(request); yield { type: 'delta', text }; yield { type: 'done', finishReason: 'stop' }; },
    },
  };
}

function make(t, w, now) {
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ ollama: w.provider }), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  t.after(() => services.close());
  if (now) services.briefings.now = () => now;
  return services;
}

test('자료 모으기: 날짜·승인 대기·어제오늘 회의만, 읽지 못한 자료는 따로', () => {
  const now = new Date(2026, 10, 14, 6, 5);
  const data = collectBriefing({
    missions: { list: () => [{ title: '메일 보내기' }, { title: '파일 정리' }] },
    meetings: { list: () => [{ title: '주간 회의', started_at: new Date(2026, 10, 13, 10).toISOString(), duration_ms: 1_800_000 }, { title: '옛 회의', started_at: new Date(2026, 9, 1).toISOString() }] },
  }, now);
  assert.match(data.text, /2026년 11월 14일 토요일 06:05/);
  assert.match(data.text, /승인 기다리는 작업 ===\n2개\n- 메일 보내기/);
  assert.match(data.text, /- 주간 회의 \(어제, 30분\)/);
  assert.doesNotMatch(data.text, /옛 회의/);
  const broken = collectBriefing({ missions: { list: () => { throw new Error('x'); } }, meetings: { list: () => [] } }, now);
  assert.match(broken.text, /읽지 못한 자료\(말하지 말 것\) ===\n- 승인 대기 작업/);
  const req = buildBriefingRequest(data, { name: '치이카와', persona: '귀엽게' });
  assert.match(req.messages[0].content, /치이카와[\s\S]*지어내지 않는다/);
  assert.match(req.messages[1].content, /<자료>[\s\S]*<\/자료>/);
  assert.equal(tidy('## 오늘\n- 첫째 **중요**\n\n- 둘째'), '오늘\n첫째 중요\n둘째');
});

test('만들기: 이 기기 안 모델로 쓰고 날짜별로 저장, 같은 날 다시 만들면 덮어씀', async (t) => {
  const w = writer('좋은 아침이에요. 승인을 기다리는 작업은 없어요.');
  const s = make(t, w, new Date(2026, 10, 14, 7, 0));
  const b = await s.briefings.generate();
  assert.equal(b.day, '2026-11-14');
  assert.equal(b.text, '좋은 아침이에요. 승인을 기다리는 작업은 없어요.');
  assert.deepEqual(b.sources, ['missions', 'meetings']);
  assert.equal(w.got[0].think, false);
  await s.briefings.generate();
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM briefings').get().n, 1);
});

test('외부 주소 모델에는 보내지 않는다', async (t) => {
  const w = writer('x', { remote: true });
  const s = make(t, w);
  await assert.rejects(s.briefings.generate(), { code: 'not_configured' });
  assert.equal(w.got.length, 0);
});

test('정한 시각 전에는 만들지 않고, 지나면 한 번만, 끄면 안 만든다', async (t) => {
  const w = writer('안녕');
  let now = new Date(2026, 10, 14, 5, 59);
  const s = make(t, w);
  s.briefings.now = () => now;
  assert.equal(await s.briefings.tick(), null);
  now = new Date(2026, 10, 14, 6, 0);
  assert.equal((await s.briefings.tick()).day, dayOf(now));
  assert.equal(await s.briefings.tick(), null); // 오늘 것이 있으면 다시 안 만듦
  assert.equal(w.got.length, 1);
  s.briefings.setSettings({ enabled: false });
  now = new Date(2026, 10, 15, 9, 0);
  assert.equal(await s.briefings.tick(), null);
  assert.throws(() => s.briefings.setSettings({ time: '25:00' }), { code: 'invalid_input' });
  assert.deepEqual(s.briefings.setSettings({ enabled: true, time: '07:30' }), { enabled: true, time: '07:30' });
});
