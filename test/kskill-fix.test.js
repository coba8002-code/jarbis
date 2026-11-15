// k-skill 점검에서 찾은 문제 고침(2026-11-15, T372~T374). 외부 조회 없이 가짜 응답만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactKma, adjustPlan, findKmaItems, KSkills } from '../src/skills/kskill.js';
import { parseKmaForecast } from '../src/board/board.js';

const kma = (rows) => JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: rows } } } });
const f = (category, fcstDate, fcstTime, fcstValue) => ({ baseDate: '20261115', baseTime: '1700', category, fcstDate, fcstTime, fcstValue, nx: 60, ny: 127 });

// 3일치 시간별 예보(12가지 항목) — 원문은 크다
function bigForecast() {
  const rows = [];
  const days = ['20261115', '20261116', '20261117'];
  for (const d of days) {
    for (let h = d === '20261115' ? 18 : 0; h < 24; h += 1) {
      const t = `${String(h).padStart(2, '0')}00`;
      rows.push(f('TMP', d, t, String(5 + (h % 7))), f('UUU', d, t, '1.2'), f('VVV', d, t, '-0.4'), f('VEC', d, t, '250'), f('WSD', d, t, '2.1'),
        f('SKY', d, t, h > 12 ? '4' : '1'), f('PTY', d, t, d === '20261116' && h >= 6 && h <= 9 ? '1' : '0'), f('POP', d, t, d === '20261116' && h >= 6 && h <= 9 ? '70' : '10'),
        f('PCP', d, t, d === '20261116' && h === 7 ? '3.0mm' : '강수없음'), f('REH', d, t, '60'), f('SNO', d, t, '적설없음'), f('WAV', d, t, '0'));
    }
    if (d !== '20261115') rows.push(f('TMN', d, '0600', '2.0'), f('TMX', d, '1500', '11.0'));
  }
  return kma(rows);
}

test('단기예보 줄이기: 3일치가 6000자 안에 다 들어가고 내일 비 소식이 남는다', () => {
  const raw = bigForecast();
  assert.ok(raw.length > 60_000, `원문 ${raw.length}자`);
  assert.ok(!raw.slice(0, 6000).includes('"20261116"'), '예전처럼 원문을 자르면 내일이 없음');
  const short = compactKma(raw);
  assert.ok(short.length < 6000, `줄인 글 ${short.length}자`);
  assert.match(short, /^기상청 예보\(발표 11\/15 17:00\), 시간별:/);
  assert.match(short, /11\/16 07시 \d+°, 비, 비 올 확률 70%, 강수 3\.0mm, 습도 60%, 바람 2\.1m\/s/);
  assert.match(short, /11\/17 23시 /);
  assert.match(short, /11\/16 하루 최저 2° 최고 11°/);
  assert.doesNotMatch(short, /UUU|VVV|VEC|WAV|적설없음|강수없음/);
});

test('초단기실황(관측)은 한 줄, 기상청 모양이 아니면 null', () => {
  const now = kma([{ baseDate: '20261115', baseTime: '1900', category: 'T1H', obsrValue: '11.2' }, { baseDate: '20261115', baseTime: '1900', category: 'PTY', obsrValue: '0' }, { baseDate: '20261115', baseTime: '1900', category: 'REH', obsrValue: '54' }, { baseDate: '20261115', baseTime: '1900', category: 'RN1', obsrValue: '0' }]);
  assert.equal(compactKma(now), '기상청 초단기실황(관측 11/15 19:00): 기온 11.2°, 비·눈 없음, 습도 54%');
  assert.equal(compactKma('not json'), null);
  assert.equal(compactKma(JSON.stringify({ items: [{ name: 'x' }] })), null);
  assert.equal(findKmaItems({ a: { b: [{ category: 'T' }] } }).length, 1);
});

test('조회: 날씨 스킬은 줄인 글을 넣고, 대기화면(full)은 원문 그대로', async () => {
  const raw = bigForecast();
  const settings = { get: (k, d) => d, set() {} };
  const k = new KSkills({ settings, providers: null, localProvider: () => null, env: {}, fetchImpl: async () => new Response(raw, { status: 200 }) });
  const skill = k.catalog.find((s) => s.name === 'korea-weather');
  const r = await k.call(skill, { path: '/v1/korea-weather/forecast', query: { lat: 37.5665, lon: 126.978 } });
  assert.match(r.text, /^기상청 예보/);
  assert.match(r.text, /11\/16 07시/);
  const full = await k.call(skill, { path: '/v1/korea-weather/forecast', query: { lat: 37.5665, lon: 126.978 } }, { full: true });
  assert.equal(full.text, raw);
});

test('다음 공휴일처럼 앞으로 찾는 질문은 이번 달만 묻지 않고 그해 전체를 묻는다', () => {
  const plan = { path: '/v1/korean-holiday/calendar', query: { operation: 'rest', year: '2026', month: '11' } };
  assert.deepEqual(adjustPlan('korean-holiday-calendar', '다음 공휴일 언제야?', plan).query, { operation: 'rest', year: '2026' });
  assert.deepEqual(adjustPlan('korean-holiday-calendar', '이번 달 공휴일 있어?', plan).query, plan.query);
  assert.deepEqual(adjustPlan('korea-weather', '다음 주 날씨', plan), plan);
  assert.equal(adjustPlan('korean-holiday-calendar', '다음 공휴일', null), null);
});

test('대기화면 최저·최고: 오늘 값 → (저녁이면) 내일 값 → 오늘 남은 시간', () => {
  const evening = new Date(2026, 10, 15, 19, 10);
  const w = parseKmaForecast(bigForecast(), evening);
  assert.deepEqual([w.min, w.max, w.range], [2, 11, '내일']);
  const noon = new Date(2026, 10, 15, 12, 0);
  const rows = kma([f('TMP', '20261115', '1300', '9'), f('TMP', '20261115', '1400', '12'), f('SKY', '20261115', '1300', '1')]);
  const w2 = parseKmaForecast(rows, noon);
  assert.deepEqual([w2.min, w2.max, w2.range], [9, 12, '오늘 남은 시간']);
});
