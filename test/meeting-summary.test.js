// 회의 의견·결론 정리 검사. 실제 Ollama 없이 가짜 이 기기 안 공급자만 쓴다(외부 전송 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { request as httpRequest } from 'node:http';
import { transcriptChunks, parseSummary, parseMmss, mmss, buildSummaryRequest } from '../src/meeting/summary.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath, fakeKey } from './helpers.js';

const seg = (s, text) => ({ start_ms: s * 1000, end_ms: s * 1000 + 4000, text });

test('시간 글: mm:ss ↔ ms', () => {
  assert.equal(mmss(65_400), '01:05');
  assert.equal(parseMmss('01:05'), 65_000);
  assert.equal(parseMmss('120:00'), 7_200_000);
  for (const bad of ['1:5', 'ab:cd', '', null, '01:75']) assert.equal(parseMmss(bad), null, String(bad));
});

test('녹취 나누기: [mm:ss] 줄, 정한 길이를 넘지 않게, 최대 조각 수를 넘으면 잘림 표시', () => {
  const segs = Array.from({ length: 40 }, (_, i) => seg(i * 10, `${i}번째 말 ${'가'.repeat(30)}`));
  const one = transcriptChunks(segs.slice(0, 2));
  assert.equal(one.chunks.length, 1);
  assert.match(one.chunks[0], /^\[00:00\] 0번째 말/);
  assert.match(one.chunks[0], /\n\[00:10\] 1번째 말/);
  const many = transcriptChunks(segs, { chunkChars: 200, maxChunks: 3 });
  assert.equal(many.chunks.length, 3);
  assert.equal(many.truncated, true);
  assert.ok(many.chunks.every((c) => c.length <= 200));
});

test('모델 답 읽기: 첫 {...}만, 칸·개수 제한, 녹취 밖 시간은 빼고, 비밀처럼 보이는 값은 버림', () => {
  const text = `정리했어요:\n${JSON.stringify({
    summary: '  출시 일정을 논의했다. ',
    opinions: [{ point: '다음 주 출시가 좋다', at: '00:10' }, { point: '테스트가 더 필요하다', at: '59:59' }, '문자열 의견', { point: '' }],
    decisions: ['금요일에 다시 보기', 42, fakeKey('sk-ant', 32)],
    todos: [{ task: '시험 목록 만들기', who: '민수' }, '자료 보내기'],
    open: ['예산은?'],
    extra: 'x',
  })}\n끝`;
  const r = parseSummary(text, { minMs: 0, maxMs: 120_000 });
  assert.equal(r.summary, '출시 일정을 논의했다.');
  assert.deepEqual(r.opinions, [{ point: '다음 주 출시가 좋다', at: '00:10' }, { point: '테스트가 더 필요하다', at: null }, { point: '문자열 의견', at: null }]);
  assert.deepEqual(r.decisions, ['금요일에 다시 보기']);
  assert.deepEqual(r.todos, [{ task: '시험 목록 만들기', who: '민수' }, { task: '자료 보내기', who: '' }]);
  assert.deepEqual(r.open, ['예산은?']);
  assert.equal('extra' in r, false);
  assert.equal(parseSummary('정리 못 함'), null);
  assert.equal(parseSummary('{"summary": ""}'), null, '빈 정리는 없음으로');
  assert.equal(parseSummary('{깨진'), null);
  const long = parseSummary(JSON.stringify({ opinions: Array.from({ length: 30 }, (_, i) => ({ point: `의견 ${i}`, at: '00:01' })) }));
  assert.equal(long.opinions.length, 12);
});

test('요청: 녹취에 없는 말·말한 사람을 지어내지 말라고 하고, JSON·생각 생략', () => {
  const req = buildSummaryRequest('주간 회의', '[00:00] 안녕하세요\n');
  assert.equal(req.format, 'json');
  assert.equal(req.think, false);
  assert.match(req.messages[0].content, /지어내지 않는다/);
  assert.match(req.messages[0].content, /말한 사람을 구분하지 못하므로/);
  assert.match(req.messages[1].content, /<녹취>\n\[00:00\] 안녕하세요/);
});

// 가짜 공급자: 받은 요청을 적고, 정해 둔 답(함수 또는 글)을 돌려준다.
function fakeProvider(name, { remote, reply }) {
  const sent = [];
  return {
    sent,
    provider: {
      name,
      describe: () => ({ name, baseUrl: remote ? 'https://cloud.example' : 'http://127.0.0.1:11434', model: remote ? 'cloud-m' : 'gemma4:12b', remote }),
      async *stream(req) { sent.push(req); yield { type: 'delta', text: typeof reply === 'function' ? reply(req, sent.length) : reply }; yield { type: 'done', finishReason: 'stop' }; },
    },
  };
}
const ANSWER = JSON.stringify({ summary: '출시를 다음 주로 정했다.', opinions: [{ point: '다음 주가 좋다', at: '00:05' }, { point: '지어낸 시간', at: '30:00' }], decisions: ['다음 주 출시'], todos: [{ task: '시험하기', who: '' }], open: [] });

function setup(t, { ollama = true, cloud = true, reply = ANSWER } = {}) {
  const local = fakeProvider('ollama', { remote: false, reply });
  const remote = fakeProvider('cloud', { remote: true, reply: ANSWER });
  const providers = new ProviderRegistry({ ...(ollama ? { ollama: local.provider } : {}), ...(cloud ? { cloud: remote.provider } : {}) });
  const services = createServices({ dataDir: dirname(tempDbPath()), providers, speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  t.after(() => services.close());
  const meeting = (segs, title = '주간 회의') => {
    const m = services.meetings.start(title);
    for (const s of segs) services.meetings.addSegment(m.id, { startMs: s.start_ms, endMs: s.end_ms, text: s.text });
    return m;
  };
  return { services, local, remote, meeting };
}

test('정리: 이 기기 안 모델에만 보내고, 녹취 밖 시간은 빼고, 저장한다(클라우드로는 안 보냄)', async (t) => {
  const { services, local, remote, meeting } = setup(t);
  const m = meeting([seg(0, '출시 일정 이야기합시다'), seg(5, '다음 주가 좋겠어요'), seg(12, '그럼 다음 주로 하죠')]);
  await assert.rejects(() => services.meetingSummaries.generate(m.id), { code: 'invalid_state' }, '녹음 중이면 거부');
  services.meetings.stop(m.id, 20_000);
  assert.equal(services.meetingSummaries.get(m.id), null);
  const r = await services.meetingSummaries.generate(m.id);
  assert.equal(r.summary, '출시를 다음 주로 정했다.');
  assert.deepEqual(r.opinions.map((o) => o.at), ['00:05', null]);
  assert.equal(r.model, 'gemma4:12b');
  assert.equal(r.segments, 3);
  assert.equal(local.sent.length, 1);
  assert.equal(remote.sent.length, 0, '클라우드로 보내지 않음');
  assert.match(local.sent[0].messages[1].content, /\[00:05\] 다음 주가 좋겠어요/);
  assert.ok(local.sent[0].keepAlive);
  assert.equal(services.meetingSummaries.get(m.id).decisions[0], '다음 주 출시');
});

test('긴 녹취: 나눠 정리한 뒤 합친다', async (t) => {
  const { services, local, meeting } = setup(t, { reply: (req, n) => JSON.stringify({ summary: `정리 ${n}`, opinions: [], decisions: [`결정 ${n}`], todos: [], open: [] }) });
  const segs = Array.from({ length: 400 }, (_, i) => seg(i * 6, `긴 회의 ${i}번째 말입니다 ${'나'.repeat(20)}`));
  const m = meeting(segs);
  services.meetings.stop(m.id, 400 * 6000 + 5000);
  const r = await services.meetingSummaries.generate(m.id);
  const parts = local.sent.length - 1;
  assert.ok(parts >= 2 && parts <= 8, `부분 ${parts}개`);
  assert.match(local.sent.at(-1).messages[0].content, /여러 부분으로 나눠 정리한 결과들을 하나로 합친다/);
  assert.equal(r.chunks, parts);
  assert.equal(r.summary, `정리 ${local.sent.length}`);
});

test('이 기기 안 모델이 없거나, 받아 적은 말이 없거나, 답을 못 읽으면 알린다', async (t) => {
  const noLocal = setup(t, { ollama: false });
  const m1 = noLocal.meeting([seg(0, '안녕')]);
  noLocal.services.meetings.stop(m1.id, 5000);
  await assert.rejects(() => noLocal.services.meetingSummaries.generate(m1.id), { code: 'not_configured' });
  assert.equal(noLocal.remote.sent.length, 0);
  const s = setup(t, { reply: '모르겠어요' });
  const m2 = s.meeting([]);
  s.services.meetings.stop(m2.id, 5000);
  await assert.rejects(() => s.services.meetingSummaries.generate(m2.id), { code: 'invalid_state' });
  const m3 = s.meeting([seg(0, '안녕')], '두 번째');
  s.services.meetings.stop(m3.id, 5000);
  await assert.rejects(() => s.services.meetingSummaries.generate(m3.id), { code: 'summary_failed' });
  await assert.rejects(() => s.services.meetingSummaries.generate(999), { code: 'not_found' });
});

test('같은 회의를 동시에 두 번 눌러도 모델에는 한 번만 묻는다', async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const local = { sent: 0 };
  const provider = {
    name: 'ollama',
    describe: () => ({ name: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'gemma4:12b', remote: false }),
    async *stream() { local.sent += 1; await gate; yield { type: 'delta', text: ANSWER }; yield { type: 'done', finishReason: 'stop' }; },
  };
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ ollama: provider }) });
  t.after(() => services.close());
  const m = services.meetings.start('회의');
  services.meetings.addSegment(m.id, { startMs: 0, endMs: 3000, text: '안녕' });
  services.meetings.stop(m.id, 5000);
  const a = services.meetingSummaries.generate(m.id);
  const b = services.meetingSummaries.generate(m.id);
  assert.equal(services.meetingSummaries.status(m.id).generating, true);
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(local.sent, 1);
  assert.equal(ra.summary, rb.summary);
  assert.equal(services.meetingSummaries.status(m.id).generating, false);
});

test('회의를 지우거나 녹취를 지우면 정리도 함께 지운다', async (t) => {
  const { services, meeting } = setup(t);
  const m = meeting([seg(0, '안녕'), seg(5, '다음 주가 좋겠어요')]);
  services.meetings.stop(m.id, 10_000);
  await services.meetingSummaries.generate(m.id);
  services.meetings.deleteTranscript(m.id);
  assert.equal(services.meetingSummaries.get(m.id), null);
  services.meetings.addSegment(m.id, { startMs: 0, endMs: 3000, text: '다시' });
  await services.meetingSummaries.generate(m.id);
  services.meetings.delete(m.id);
  assert.equal(services.db.prepare('SELECT count(*) AS n FROM meeting_summaries').get().n, 0);
});

test('화면 API: 없으면 null, 만들면 정리, 녹음 중이면 409, 없는 회의 404', async (t) => {
  const { services, meeting } = setup(t);
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(() => app.close());
  const call = (method, path) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject); rq.end();
  });
  const m = meeting([seg(0, '안녕'), seg(5, '다음 주가 좋겠어요')]);
  assert.equal((await call('POST', `/api/meetings/${m.id}/summary`)).status, 409);
  services.meetings.stop(m.id, 10_000);
  assert.deepEqual((await call('GET', `/api/meetings/${m.id}/summary`)).json, { summary: null, generating: false });
  const made = await call('POST', `/api/meetings/${m.id}/summary`);
  assert.equal(made.status, 200);
  assert.equal(made.json.summary.summary, '출시를 다음 주로 정했다.');
  assert.equal((await call('GET', `/api/meetings/${m.id}/summary`)).json.summary.opinions[0].at, '00:05');
  assert.equal((await call('GET', '/api/meetings/999/summary')).status, 404);
});
