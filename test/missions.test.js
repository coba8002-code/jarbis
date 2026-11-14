import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { MissionControl } from '../src/mission/missions.js';
import { tempDbPath } from './helpers.js';

function setup(t, path = tempDbPath(t)) {
  const calls = [];
  const executors = {
    'test.count': async (m) => {
      calls.push(m.id);
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, text: m.content.text };
    },
    'test.fail': async () => {
      calls.push('fail');
      throw Object.assign(new Error('boom'), { code: 'executor_failed' });
    },
  };
  const db = openDb(path);
  t.after(() => { try { db.close(); } catch { /* 이미 닫힘 */ } });
  return { db, path, calls, executors, mc: new MissionControl(db, { executors }) };
}

const base = { kind: 'test.count', title: '메일 보내기', target: 'a@example.com', content: { text: '안녕' }, impact: '외부 전송 1건' };

test('새 미션은 승인 대기이고 내용 버전이 있다', (t) => {
  const { mc } = setup(t);
  const m = mc.create(base);
  assert.equal(m.status, 'pending');
  assert.match(m.content_version, /^[0-9a-f]{64}$/);
  assert.equal(m.approved_version, null);
});

test('승인 전에는 실행되지 않는다', async (t) => {
  const { mc, calls } = setup(t);
  const m = mc.create(base);
  await assert.rejects(mc.execute(m.id), { code: 'approval_required' });
  assert.equal(calls.length, 0);
  assert.equal(mc.get(m.id).status, 'pending');
});

test('거절 후에는 실행·승인되지 않는다', async (t) => {
  const { mc, calls } = setup(t);
  const m = mc.create(base);
  mc.reject(m.id);
  await assert.rejects(mc.execute(m.id), { code: 'invalid_state' });
  assert.throws(() => mc.approve(m.id, m.content_version), { code: 'invalid_state' });
  assert.throws(() => mc.update(m.id, { content: { text: 'x' } }), { code: 'invalid_state' });
  assert.equal(calls.length, 0);
});

test('다른 버전으로는 승인되지 않는다', (t) => {
  const { mc } = setup(t);
  const m = mc.create(base);
  assert.throws(() => mc.approve(m.id, 'a'.repeat(64)), { code: 'version_mismatch' });
  assert.throws(() => mc.approve(m.id, undefined), { code: 'version_mismatch' });
  assert.equal(mc.get(m.id).status, 'pending');
});

test('승인 후 내용이 바뀌면 재승인이 필요하다', async (t) => {
  const { mc, calls } = setup(t);
  const m = mc.create(base);
  mc.approve(m.id, m.content_version);
  const changed = mc.update(m.id, { content: { text: '바뀐 내용' } });
  assert.equal(changed.status, 'pending');
  assert.equal(changed.approved_version, null);
  assert.notEqual(changed.content_version, m.content_version);
  await assert.rejects(mc.execute(m.id), { code: 'approval_required' });
  assert.throws(() => mc.approve(m.id, m.content_version), { code: 'version_mismatch' });
  mc.approve(m.id, changed.content_version);
  const done = await mc.execute(m.id);
  assert.equal(done.status, 'done');
  assert.equal(done.result.text, '바뀐 내용');
  assert.deepEqual(calls, [m.id]);
});

test('대상·영향만 바뀌어도 재승인이 필요하다', (t) => {
  const { mc } = setup(t);
  const m = mc.create(base);
  mc.approve(m.id, m.content_version);
  assert.equal(mc.update(m.id, { target: 'b@example.com' }).status, 'pending');
});

test('같은 내용으로 수정하면 승인이 유지된다', (t) => {
  const { mc } = setup(t);
  const m = mc.create(base);
  mc.approve(m.id, m.content_version);
  assert.equal(mc.update(m.id, { content: { text: '안녕' } }).status, 'approved');
});

test('중복 승인과 동시 10회 실행에도 한 번만 실행된다', async (t) => {
  const { mc, calls } = setup(t);
  const m = mc.create(base);
  mc.approve(m.id, m.content_version);
  mc.approve(m.id, m.content_version);
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => mc.execute(m.id)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 9);
  for (const r of results.filter((x) => x.status === 'rejected')) assert.equal(r.reason.code, 'invalid_state');
  assert.equal(calls.length, 1);
  await assert.rejects(mc.execute(m.id), { code: 'invalid_state' });
  assert.equal(calls.length, 1);
});

test('실행 실패는 기록되고 자동 재실행되지 않는다', async (t) => {
  const { mc, calls } = setup(t);
  const m = mc.create({ ...base, kind: 'test.fail' });
  mc.approve(m.id, m.content_version);
  const failed = await mc.execute(m.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /executor_failed: boom/);
  await assert.rejects(mc.execute(m.id), { code: 'invalid_state' });
  assert.equal(calls.length, 1);
});

test('취소된 미션은 실행되지 않는다', async (t) => {
  const { mc, calls } = setup(t);
  const m = mc.create(base);
  mc.approve(m.id, m.content_version);
  mc.cancel(m.id);
  await assert.rejects(mc.execute(m.id), { code: 'invalid_state' });
  assert.equal(calls.length, 0);
});

test('재시작 후 대기·승인 상태와 내용이 복원되고 완료 미션은 다시 실행되지 않는다', async (t) => {
  const first = setup(t);
  const pending = first.mc.create(base);
  const approved = first.mc.create({ ...base, title: '두 번째' });
  first.mc.approve(approved.id, approved.content_version);
  const done = first.mc.create({ ...base, title: '세 번째' });
  first.mc.approve(done.id, done.content_version);
  await first.mc.execute(done.id);
  first.db.close();

  const second = setup(t, first.path);
  assert.deepEqual(second.mc.recoverInterrupted(), []);
  assert.equal(second.mc.get(pending.id).status, 'pending');
  assert.deepEqual(second.mc.get(pending.id).content, base.content);
  assert.equal(second.mc.get(approved.id).status, 'approved');
  assert.equal(second.mc.get(approved.id).approved_version, approved.content_version);
  await assert.rejects(second.mc.execute(done.id), { code: 'invalid_state' });
  await assert.rejects(second.mc.execute(pending.id), { code: 'approval_required' });
  const ran = await second.mc.execute(approved.id);
  assert.equal(ran.status, 'done');
  assert.deepEqual(second.calls, [approved.id]);
});

test('실행 중 꺼진 미션은 재시작 때 중단으로 바뀌고 자동 재실행되지 않는다', async (t) => {
  const first = setup(t);
  const m = first.mc.create(base);
  first.mc.approve(m.id, m.content_version);
  // 실행 중 강제 종료를 흉내 낸다: 선점만 된 상태로 DB를 닫는다.
  first.db.prepare("UPDATE missions SET status = 'running' WHERE id = ?").run(m.id);
  first.db.close();

  const second = setup(t, first.path);
  assert.deepEqual(second.mc.recoverInterrupted(), [m.id]);
  assert.equal(second.mc.get(m.id).status, 'interrupted');
  await assert.rejects(second.mc.execute(m.id), { code: 'invalid_state' });
  assert.equal(second.calls.length, 0);
});

test('모든 상태 변화가 기록된다', async (t) => {
  const { mc } = setup(t);
  const m = mc.create(base);
  mc.approve(m.id, m.content_version);
  const u = mc.update(m.id, { content: { text: '2' } });
  mc.approve(m.id, u.content_version);
  await mc.execute(m.id);
  const flow = mc.events(m.id).map((e) => `${e.from_status ?? '-'}>${e.to_status}`);
  assert.deepEqual(flow, ['->pending', 'pending>approved', 'approved>pending', 'pending>approved', 'approved>running', 'running>done']);
});

test('알 수 없는 실행기와 빈 값은 거부된다', (t) => {
  const { mc } = setup(t);
  assert.throws(() => mc.create({ ...base, kind: 'nope' }), { code: 'unknown_executor' });
  assert.throws(() => mc.create({ ...base, impact: ' ' }), { code: 'invalid_input' });
  assert.throws(() => mc.get(999), { code: 'not_found' });
});
