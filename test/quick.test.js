import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { MissionControl } from '../src/mission/missions.js';
import { QuickActions } from '../src/quick/quickActions.js';
import { tempDbPath } from './helpers.js';

function setup(t) {
  const db = openDb(tempDbPath(t));
  t.after(() => db.close());
  const mc = new MissionControl(db);
  return { mc, qa: new QuickActions(mc) };
}

test('Quick Action은 실행하지 않고 승인 대기 미션을 만든다', async (t) => {
  const { mc, qa } = setup(t);
  const m = qa.request('echo', { text: '빠른 작업' });
  assert.equal(m.status, 'pending');
  assert.equal(m.source, 'quick:echo');
  await assert.rejects(mc.execute(m.id), { code: 'approval_required' });
});

test('Quick Action도 승인 후 한 번만 실행된다', async (t) => {
  const { mc, qa } = setup(t);
  const m = qa.request('echo', { text: 'a' });
  mc.approve(m.id, m.content_version);
  const results = await Promise.allSettled([mc.execute(m.id), mc.execute(m.id), mc.execute(m.id)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.deepEqual(mc.get(m.id).result, { echoed: { text: 'a' } });
});

test('Quick Action도 거절·내용 변경 규칙을 따른다', async (t) => {
  const { mc, qa } = setup(t);
  const r = qa.request('echo', { text: 'r' });
  mc.reject(r.id);
  await assert.rejects(mc.execute(r.id), { code: 'invalid_state' });

  const c = qa.request('echo', { text: 'c' });
  mc.approve(c.id, c.content_version);
  mc.update(c.id, { content: { text: 'changed' } });
  await assert.rejects(mc.execute(c.id), { code: 'approval_required' });
});

test('Quick Action 실패는 기록만 된다', async (t) => {
  const { mc, qa } = setup(t);
  const m = qa.request('fail-demo');
  mc.approve(m.id, m.content_version);
  assert.equal((await mc.execute(m.id)).status, 'failed');
});

test('Quick Action 객체에는 직접 실행 기능이 없다', (t) => {
  const { qa } = setup(t);
  assert.equal(typeof qa.execute, 'undefined');
  assert.equal(typeof qa.run, 'undefined');
  assert.throws(() => qa.request('nope'), { code: 'not_found' });
  assert.deepEqual(qa.list().map((a) => a.name), ['echo', 'fail-demo']);
});
