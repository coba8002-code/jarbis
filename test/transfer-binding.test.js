// D7 승인한 전송 대상(주소·모델·외부 여부)과 실제 실행 대상이 같을 때만 보낸다.
// D8 공급자 서버가 다른 주소로 리디렉션해도 따라가지 않는다.
// 외부 접속 없음: 기록용 가짜 공급자, 가짜 fetch, 127.0.0.1 가짜 서버만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { openDb } from '../src/store/db.js';
import { MissionControl } from '../src/mission/missions.js';
import { defaultExecutors } from '../src/mission/executors.js';
import { MemoryStore } from '../src/memory/memory.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createHttpProviders } from '../src/providers/adapters.js';
import { Conversation, createTransferExecutor, TRANSFER_KIND } from '../src/conversation/transfer.js';
import { createServices } from '../src/app/services.js';
import { tempDbPath } from './helpers.js';

const req = { messages: [{ role: 'user', content: '안녕' }] };

// describe 결과를 바꿀 수 있는 기록용 가짜 공급자
function movable(info) {
  const sent = [];
  const state = { ...info };
  return {
    sent,
    state,
    provider: {
      name: 'cloud',
      describe: () => ({ name: 'cloud', ...state }),
      async *stream(request, opts = {}) {
        sent.push({ request, baseUrl: state.baseUrl, expect: opts.expect });
        yield { type: 'delta', text: '답' };
        yield { type: 'done', finishReason: 'stop' };
      },
    },
  };
}

function setup(t, info = { baseUrl: 'https://approved.example', model: 'm1', remote: true }) {
  const db = openDb(tempDbPath());
  t.after(() => db.close());
  const cloud = movable(info);
  const memory = new MemoryStore(db);
  const providers = new ProviderRegistry({ cloud: cloud.provider });
  const missions = new MissionControl(db, { executors: { ...defaultExecutors(), [TRANSFER_KIND]: createTransferExecutor({ memory, providers }) } });
  const chat = new Conversation({ missions, memory, providers });
  return { cloud, memory, missions, chat };
}

async function approvedMission(s) {
  const m = s.memory.add('아메리카노를 좋아함');
  const r = await s.chat.ask({ provider: 'cloud', question: '추천', memoryIds: [m.id] });
  s.missions.approve(r.mission.id, r.mission.content_version);
  return r;
}

test('D7 승인 화면 내용에 보낼 주소·모델·외부 여부가 들어간다', async (t) => {
  const s = setup(t);
  const r = await approvedMission(s);
  assert.equal(r.mission.content.baseUrl, 'https://approved.example');
  assert.equal(r.mission.content.model, 'm1');
  assert.equal(r.mission.content.remote, true);
});

test('D7 승인 뒤 공급자 주소가 바뀌면 보내지 않는다', async (t) => {
  const s = setup(t);
  const r = await approvedMission(s);
  s.cloud.state.baseUrl = 'https://changed.example';
  const done = await s.missions.execute(r.mission.id);
  assert.equal(done.status, 'failed');
  assert.match(done.error, /target_changed/);
  assert.equal(s.cloud.sent.length, 0);
});

test('D7 승인 때 모델이 없었는데 실행 때 다른 모델이 정해지면 보내지 않는다', async (t) => {
  const s = setup(t, { baseUrl: 'https://approved.example', model: null, remote: true });
  const r = await approvedMission(s);
  s.cloud.state.model = 'surprise-model';
  const done = await s.missions.execute(r.mission.id);
  assert.equal(done.status, 'failed');
  assert.match(done.error, /target_changed/);
  assert.equal(s.cloud.sent.length, 0);
});

test('D7 외부 여부가 바뀌어도 보내지 않는다', async (t) => {
  const s = setup(t);
  const r = await approvedMission(s);
  s.cloud.state.remote = false;
  const done = await s.missions.execute(r.mission.id);
  assert.equal(done.status, 'failed');
  assert.equal(s.cloud.sent.length, 0);
});

test('D7 대상이 같으면 승인한 주소를 기대값으로 함께 넘겨 보낸다', async (t) => {
  const s = setup(t);
  const r = await approvedMission(s);
  assert.equal((await s.missions.execute(r.mission.id)).status, 'done');
  assert.equal(s.cloud.sent.length, 1);
  assert.deepEqual(s.cloud.sent[0].expect, { baseUrl: 'https://approved.example', model: 'm1' });
});

test('D7 대상 정보가 없는 옛 전송 미션은 보내지 않는다', async (t) => {
  const s = setup(t);
  const r = await approvedMission(s);
  const old = { ...r.mission.content };
  delete old.baseUrl;
  delete old.remote;
  s.missions.update(r.mission.id, { content: old });
  const again = s.missions.get(r.mission.id);
  s.missions.approve(again.id, again.content_version);
  const done = await s.missions.execute(again.id);
  assert.equal(done.status, 'failed');
  assert.match(done.error, /target_changed/);
  assert.equal(s.cloud.sent.length, 0);
});

// 실제 HTTP 어댑터 + 가짜 fetch: 재시작과 환경 설정 변경
function claudeSse() {
  const body = [
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"답"}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

test('D7 재시작 뒤 환경 설정(주소)이 바뀌면 fetch 없이 막고, 같으면 승인한 주소로만 보낸다', async (t) => {
  const dataDir = dirname(tempDbPath());
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return claudeSse(); };
  const envA = { ANTHROPIC_API_KEY: 'test-key-not-real', JARVIS_CLAUDE_BASE_URL: 'https://approved.example', JARVIS_ALLOW_REMOTE: '1' };
  const first = createServices({ dataDir, providers: ProviderRegistry.fromEnv({ env: envA, fetchImpl }) });
  const m = first.memory.add('기억');
  const r = await first.chat.ask({ provider: 'claude', question: 'q', memoryIds: [m.id] });
  assert.equal(r.status, 'approval_required');
  first.missions.approve(r.mission.id, r.mission.content_version);
  const r2 = await first.chat.ask({ provider: 'claude', question: 'q2', memoryIds: [m.id] });
  first.missions.approve(r2.mission.id, r2.mission.content_version);
  first.close();

  const envB = { ...envA, JARVIS_CLAUDE_BASE_URL: 'https://changed.example' };
  const second = createServices({ dataDir, providers: ProviderRegistry.fromEnv({ env: envB, fetchImpl }) });
  const blocked = await second.missions.execute(r.mission.id);
  assert.equal(blocked.status, 'failed');
  assert.match(blocked.error, /target_changed/);
  assert.deepEqual(urls, []);
  second.close();

  const third = createServices({ dataDir, providers: ProviderRegistry.fromEnv({ env: envA, fetchImpl }) });
  t.after(() => third.close());
  assert.equal((await third.missions.execute(r2.mission.id)).status, 'done');
  assert.deepEqual(urls, ['https://approved.example/v1/messages']);
});

test('D7 어댑터도 기대 주소·모델과 다르면 fetch 전에 막는다', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return claudeSse(); };
  const p = createHttpProviders({ env: { ANTHROPIC_API_KEY: 'k', JARVIS_CLAUDE_BASE_URL: 'https://changed.example', JARVIS_ALLOW_REMOTE: '1' }, fetchImpl });
  await assert.rejects(async () => { for await (const ev of p.claude.stream(req, { expect: { baseUrl: 'https://approved.example', model: 'claude-opus-5-5' } })) void ev; }, { code: 'target_changed' });
  await assert.rejects(async () => { for await (const ev of p.claude.stream(req, { expect: { baseUrl: 'https://changed.example', model: 'other' } })) void ev; }, { code: 'target_changed' });
  assert.equal(calls, 0);
});

// D8 리디렉션
async function serve(handler) {
  const s = createServer(handler);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { server: s, base: `http://127.0.0.1:${s.address().port}` };
}

test('D8 공급자 서버가 다른 주소로 리디렉션해도 따라가지 않고, 다른 서버는 요청을 받지 않는다', async (t) => {
  const hits = [];
  const other = await serve((rq, rs) => { hits.push(rq.url); rs.writeHead(200, { 'content-type': 'text/event-stream' }); rs.end('data: [DONE]\n\n'); });
  const approved = await serve((rq, rs) => {
    rq.resume();
    rq.on('end', () => { rs.writeHead(307, { location: `${other.base}/v1/chat/completions` }); rs.end(); });
  });
  t.after(() => { other.server.close(); approved.server.close(); });
  const p = createHttpProviders({ env: { OPENAI_API_KEY: 'test-key-not-real', JARVIS_OPENAI_MODEL: 'm', JARVIS_OPENAI_BASE_URL: `${approved.base}/v1` } });
  for (const name of ['openai']) {
    await assert.rejects(async () => { for await (const ev of p[name].stream(req)) void ev; }, (e) => e.code === 'redirect_blocked' && /307/.test(e.message));
  }
  const ollamaRedirect = createHttpProviders({ env: { JARVIS_OLLAMA_MODEL: 'm', JARVIS_OLLAMA_BASE_URL: approved.base } });
  await assert.rejects(async () => { for await (const ev of ollamaRedirect.ollama.stream(req)) void ev; }, { code: 'redirect_blocked' });
  assert.deepEqual(hits, []);
});
