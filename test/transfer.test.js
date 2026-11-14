// 개인 자료 외부 전송 승인 (잠정, FR-010a). 네트워크 없이 기록용 가짜 공급자만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { MissionControl } from '../src/mission/missions.js';
import { defaultExecutors } from '../src/mission/executors.js';
import { MemoryStore } from '../src/memory/memory.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { Conversation, createTransferExecutor, TRANSFER_KIND } from '../src/conversation/transfer.js';
import { tempDbPath } from './helpers.js';

function spyProvider(name, remote) {
  const sent = [];
  return {
    sent,
    provider: {
      name,
      describe: () => ({ name, baseUrl: remote ? 'https://cloud.example' : 'http://127.0.0.1:1', model: 'm1', remote }),
      async *stream(request) {
        sent.push(request);
        yield { type: 'delta', text: `${name} 답` };
        yield { type: 'done', finishReason: 'stop' };
      },
    },
  };
}

function setup(t, path = tempDbPath()) {
  const db = openDb(path);
  t.after(() => { try { db.close(); } catch { /* 이미 닫힘 */ } });
  const cloud = spyProvider('cloud', true);
  const local = spyProvider('local', false);
  const memory = new MemoryStore(db);
  const providers = new ProviderRegistry({ cloud: cloud.provider, local: local.provider });
  const missions = new MissionControl(db, {
    executors: { ...defaultExecutors(), [TRANSFER_KIND]: createTransferExecutor({ memory, providers }) },
  });
  return { db, path, memory, missions, chat: new Conversation({ missions, memory, providers }), cloud, local };
}

test('외부 공급자 + 기억: 보내지 않고 승인 대기 미션을 만든다', async (t) => {
  const { chat, memory, cloud } = setup(t);
  const a = memory.add('아메리카노를 좋아함');
  const r = await chat.ask({ provider: 'cloud', question: '음료 추천해 줘', memoryIds: [a.id] });
  assert.equal(r.status, 'approval_required');
  assert.equal(cloud.sent.length, 0);
  assert.equal(r.mission.status, 'pending');
  assert.equal(r.mission.kind, TRANSFER_KIND);
  assert.match(r.mission.target, /cloud\.example/);
  assert.match(r.mission.impact, /기억 1개/);
  assert.equal(r.preview.ok, true);
  assert.match(r.preview.request.messages[0].content, /아메리카노/);
});

test('미션 기록에는 기억 원문이 없다', async (t) => {
  const { chat, memory, db } = setup(t);
  const a = memory.add('비밀번호 힌트는 고양이 이름');
  const r = await chat.ask({ provider: 'cloud', question: '질문', memoryIds: [a.id] });
  const raw = db.prepare('SELECT content FROM missions WHERE id = ?').get(r.mission.id).content;
  assert.ok(!raw.includes('고양이'), raw);
  assert.match(raw, /"sha256":"[0-9a-f]{64}"/);
});

test('승인 후 실행하면 승인한 내용 그대로 한 번만 보낸다', async (t) => {
  const { chat, memory, missions, cloud } = setup(t);
  const a = memory.add('아메리카노를 좋아함');
  const r = await chat.ask({ provider: 'cloud', question: '음료 추천해 줘', memoryIds: [a.id] });
  await assert.rejects(missions.execute(r.mission.id), { code: 'approval_required' });
  assert.equal(cloud.sent.length, 0);

  missions.approve(r.mission.id, r.mission.content_version);
  const results = await Promise.allSettled([missions.execute(r.mission.id), missions.execute(r.mission.id)]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(cloud.sent.length, 1);
  assert.deepEqual(cloud.sent[0], r.preview.request);
  const done = missions.get(r.mission.id);
  assert.equal(done.status, 'done');
  assert.deepEqual(done.result, { provider: 'cloud', text: 'cloud 답', finishReason: 'stop' });
});

test('거절하면 보내지 않는다', async (t) => {
  const { chat, memory, missions, cloud } = setup(t);
  const a = memory.add('기억');
  const r = await chat.ask({ provider: 'cloud', question: 'q', memoryIds: [a.id] });
  missions.reject(r.mission.id);
  await assert.rejects(missions.execute(r.mission.id), { code: 'invalid_state' });
  assert.equal(cloud.sent.length, 0);
});

test('승인 뒤 기억을 고치거나 지우면 보내지 않는다', async (t) => {
  const { chat, memory, missions, cloud } = setup(t);
  const a = memory.add('원래 기억');
  const b = memory.add('지울 기억');
  const r1 = await chat.ask({ provider: 'cloud', question: 'q', memoryIds: [a.id] });
  const r2 = await chat.ask({ provider: 'cloud', question: 'q', memoryIds: [b.id] });
  missions.approve(r1.mission.id, r1.mission.content_version);
  missions.approve(r2.mission.id, r2.mission.content_version);
  memory.update(a.id, '바뀐 기억');
  memory.delete(b.id);

  assert.equal(chat.preview(r1.mission.id).ok, false);
  const f1 = await missions.execute(r1.mission.id);
  const f2 = await missions.execute(r2.mission.id);
  assert.equal(f1.status, 'failed');
  assert.match(f1.error, /memory_changed/);
  assert.equal(f2.status, 'failed');
  assert.match(f2.error, /memory_changed/);
  assert.equal(cloud.sent.length, 0);
});

test('질문을 바꾸면 재승인이 필요하다', async (t) => {
  const { chat, memory, missions, cloud } = setup(t);
  const a = memory.add('기억');
  const r = await chat.ask({ provider: 'cloud', question: '처음 질문', memoryIds: [a.id] });
  missions.approve(r.mission.id, r.mission.content_version);
  missions.update(r.mission.id, { content: { ...r.mission.content, question: '바꾼 질문' } });
  await assert.rejects(missions.execute(r.mission.id), { code: 'approval_required' });
  assert.equal(cloud.sent.length, 0);
});

test('로컬 공급자는 기억이 있어도 바로 보낸다', async (t) => {
  const { chat, memory, missions, local } = setup(t);
  const a = memory.add('로컬 기억');
  const r = await chat.ask({ provider: 'local', question: '질문', memoryIds: [a.id] });
  assert.equal(r.status, 'sent');
  assert.equal(r.reply.text, 'local 답');
  assert.equal(local.sent.length, 1);
  assert.match(local.sent[0].messages[0].content, /로컬 기억/);
  assert.equal(missions.list().length, 0);
});

test('기억 없이 외부 공급자에 질문만 보내면 바로 보낸다', async (t) => {
  const { chat, missions, cloud } = setup(t);
  const r = await chat.ask({ provider: 'cloud', question: '날씨 이야기해 줘' });
  assert.equal(r.status, 'sent');
  assert.deepEqual(cloud.sent[0].messages, [{ role: 'user', content: '날씨 이야기해 줘' }]);
  assert.equal(missions.list().length, 0);
});

test('재시작 후에도 전송 미션 승인 대기가 남고 실행할 수 있다', async (t) => {
  const first = setup(t);
  const a = first.memory.add('재시작 기억');
  const r = await first.chat.ask({ provider: 'cloud', question: 'q', memoryIds: [a.id] });
  first.db.close();
  const second = setup(t, first.path);
  assert.equal(second.missions.get(r.mission.id).status, 'pending');
  second.missions.approve(r.mission.id, r.mission.content_version);
  assert.equal((await second.missions.execute(r.mission.id)).status, 'done');
  assert.equal(second.cloud.sent.length, 1);
});

test('없는 기억·빈 질문·모르는 공급자는 거부', async (t) => {
  const { chat } = setup(t);
  await assert.rejects(chat.ask({ provider: 'cloud', question: 'q', memoryIds: [99] }), { code: 'not_found' });
  await assert.rejects(chat.ask({ provider: 'cloud', question: ' ' }), { code: 'invalid_input' });
  await assert.rejects(chat.ask({ provider: 'nope', question: 'q' }), { code: 'not_configured' });
});

test('HTTP 어댑터: 루프백이 아닌 Ollama는 외부로 판정한다', () => {
  const local = ProviderRegistry.fromEnv({ env: {} });
  assert.equal(local.describe('ollama').remote, false);
  assert.equal(local.describe('claude').remote, true);
  const far = ProviderRegistry.fromEnv({ env: { JARVIS_OLLAMA_BASE_URL: 'http://192.168.0.10:11434' } });
  assert.equal(far.describe('ollama').remote, true);
});
