// k-skill 연결 검사. 실제 외부 조회 서버·모델 없이 가짜만 쓴다(외부 전송 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { loadCatalog, routePatterns, validatePlan, KSkills } from '../src/skills/kskill.js';
import { createServices } from '../src/app/services.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

test('설명서 사본: 조회 전용 스킬만, 경로가 있고, 출처·라이선스가 함께 있다', () => {
  const list = loadCatalog();
  assert.ok(list.length >= 20);
  const names = list.map((s) => s.name);
  for (const n of ['korea-weather', 'korean-holiday-calendar', 'seoul-subway-arrival', 'naver-news-search', 'fine-dust-location']) assert.ok(names.includes(n), n);
  assert.ok(list.every((s) => s.routes.length > 0));
});

test('경로 확인: 그 스킬 설명서의 /v1/ 경로만, 값은 짧은 글·숫자만, 비밀 값은 가림', () => {
  const skill = { routes: routePatterns('curl "$BASE/v1/korea-weather/now" ... /v1/kopis/performances/{id} ... /v1/real-estate/:assetType/:dealType') };
  assert.deepEqual(validatePlan(skill, { path: '/v1/korea-weather/now', query: { lat: 37.5, lon: '127.0' } }).query, { lat: '37.5', lon: '127.0' });
  assert.equal(validatePlan(skill, { path: '/v1/kopis/performances/PF12345' }).path, '/v1/kopis/performances/PF12345');
  assert.equal(validatePlan(skill, { path: '/v1/real-estate/apt/trade' }).path, '/v1/real-estate/apt/trade');
  for (const bad of ['/v1/other/route', 'https://evil.example/v1/korea-weather/now', '/v1/korea-weather/now/../../admin', '/v1/kopis/performances/a/b', '/v1/kopis/performances/..', '/v1/kopis/performances/%2e%2e']) {
    assert.throws(() => validatePlan(skill, { path: bad }), { code: 'invalid_input' }, bad);
  }
  const q = validatePlan(skill, { path: '/v1/korea-weather/now', query: { q: 'sk-proj-abcdefghijklmnopqrstuvwx', obj: { a: 1 }, 'bad key': 'x', long: 'x'.repeat(200) } }).query;
  assert.deepEqual(Object.keys(q), ['q']);
  assert.match(q.q, /가림/);
});

function setup(t, { answers, proxy }) {
  const calls = { model: [], fetch: [] };
  const queue = [...answers];
  const ollama = {
    name: 'ollama',
    describe: () => ({ name: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'gemma4:12b', remote: false }),
    async *stream(req) { calls.model.push(req); const next = queue.shift() ?? '좋아요.'; yield { type: 'delta', text: typeof next === 'string' ? next : JSON.stringify(next) }; yield { type: 'done', finishReason: 'stop' }; },
  };
  const kskillFetch = async (url, opts) => { calls.fetch.push({ url: String(url), opts }); return proxy(url); };
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ ollama }), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) }, env: { KSKILL_PROXY_BASE_URL: 'https://proxy.test' }, kskillFetch });
  t.after(() => services.close());
  return { services, calls };
}
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('켜지 않은 스킬은 쓰지 않고, 켜려면 동의가 필요하다', async (t) => {
  const { services, calls } = setup(t, { answers: ['맑아요.'], proxy: () => ok({}) });
  const r = await services.chat.ask({ provider: 'ollama', question: '내일 서울 날씨 어때?' });
  assert.equal(r.skill, undefined);
  assert.equal(calls.fetch.length, 0);
  assert.throws(() => services.kskills.set('korea-weather', { enabled: true }), { code: 'consent_required' });
  assert.equal(services.kskills.set('korea-weather', { enabled: true, consent: true }).enabled, true);
  assert.throws(() => services.kskills.set('no-such', { enabled: true, consent: true }), { code: 'not_found' });
});

test('켠 스킬: 계획 → 정한 서버에 GET 한 번 → 결과를 참고 자료로 넣어 답함(기억·주변 대화는 안 보냄)', async (t) => {
  const { services, calls } = setup(t, {
    answers: [{ path: '/v1/korea-weather/forecast', query: { lat: 37.5665, lon: 126.978 } }, '내일은 맑고 20도예요.'],
    proxy: () => ok({ items: [{ category: 'TMP', fcstValue: '20' }] }),
  });
  services.kskills.set('korea-weather', { enabled: true, consent: true });
  services.memory.add('사용자는 비밀 프로젝트를 한다');
  const r = await services.chat.ask({ provider: 'ollama', question: '내일 서울 날씨 어때?', memoryIds: [1] });
  assert.equal(r.reply.text, '내일은 맑고 20도예요.');
  assert.deepEqual(r.skill, { name: 'korea-weather', path: '/v1/korea-weather/forecast', failed: false });
  assert.equal(calls.fetch.length, 1);
  const u = new URL(calls.fetch[0].url);
  assert.equal(u.origin, 'https://proxy.test');
  assert.equal(u.pathname, '/v1/korea-weather/forecast');
  assert.equal(calls.fetch[0].opts.method, 'GET');
  assert.equal(calls.fetch[0].opts.redirect, 'manual');
  assert.doesNotMatch(calls.fetch[0].url, /비밀/);
  const final = calls.model.at(-1).messages.map((m) => m.content).join('\n');
  assert.match(final, /외부 조회 결과[\s\S]*fcstValue/);
});

test('필요한 값이 없으면 되묻고, 설명서 밖 경로는 부르지 않고, 실패는 알림', async (t) => {
  const asked = setup(t, { answers: [{ ask: '어느 역의 도착 정보를 볼까요?' }], proxy: () => ok({}) });
  asked.services.kskills.set('seoul-subway-arrival', { enabled: true, consent: true });
  const r1 = await asked.services.chat.ask({ provider: 'ollama', question: '지하철 언제 와?' });
  assert.equal(r1.reply.text, '어느 역의 도착 정보를 볼까요?');
  assert.equal(r1.skill.asked, true);
  assert.equal(asked.calls.fetch.length, 0);

  const evil = setup(t, { answers: [{ path: '/admin/delete' }, '확인하지 못했어요.'], proxy: () => ok({}) });
  evil.services.kskills.set('seoul-subway-arrival', { enabled: true, consent: true });
  const r2 = await evil.services.chat.ask({ provider: 'ollama', question: '강남역 지하철 언제 와?' });
  assert.equal(evil.calls.fetch.length, 0);
  assert.equal(r2.skill.failed, true);

  const down = setup(t, { answers: [{ path: '/v1/seoul-subway/arrival', query: { station: '강남' } }, '지금은 확인하지 못했어요.'], proxy: () => new Response('no', { status: 503 }) });
  down.services.kskills.set('seoul-subway-arrival', { enabled: true, consent: true });
  const r3 = await down.services.chat.ask({ provider: 'ollama', question: '강남역 지하철 언제 와?' });
  assert.equal(r3.skill.failed, true);
  assert.match(down.calls.model.at(-1).messages.map((m) => m.content).join('\n'), /실패함: 조회 실패: HTTP 503/);

  const moved = setup(t, { answers: [{ path: '/v1/seoul-subway/arrival', query: { station: '강남' } }, 'x'], proxy: () => new Response('', { status: 302, headers: { location: 'https://elsewhere.test' } }) });
  moved.services.kskills.set('seoul-subway-arrival', { enabled: true, consent: true });
  assert.equal((await moved.services.chat.ask({ provider: 'ollama', question: '강남역 지하철 언제 와?' })).skill.failed, true);
});

test('낱말이 맞지 않으면 모델을 더 부르지 않고 외부 조회도 하지 않는다', async (t) => {
  const { services, calls } = setup(t, { answers: ['안녕!'], proxy: () => ok({}) });
  services.kskills.set('korea-weather', { enabled: true, consent: true });
  await services.chat.ask({ provider: 'ollama', question: '안녕 반가워' });
  assert.equal(calls.model.length, 1);
  assert.equal(calls.fetch.length, 0);
});

test('기본 위치와 아침 브리핑 날씨: 날씨 스킬을 켜고 위치가 있을 때만', async (t) => {
  const { services, calls } = setup(t, { answers: ['좋은 아침. 오늘 20도예요.'], proxy: () => ok({ tmp: 20 }) });
  assert.throws(() => services.kskills.setHome({ lat: 10, lon: 10 }), { code: 'invalid_input' });
  services.kskills.setHome({ name: '우리 집', lat: 37.56651, lon: 126.97801 });
  assert.equal(await services.kskills.briefingWeather(), null); // 아직 스킬 꺼짐
  services.kskills.set('korea-weather', { enabled: true, consent: true });
  const b = await services.briefings.generate();
  assert.ok(b.sources.includes('k-skill:korea-weather'));
  assert.equal(new URL(calls.fetch[0].url).searchParams.get('lat'), '37.5665');
  assert.match(calls.model[0].messages[1].content, /=== 날씨 ===[\s\S]*우리 집/);
});
