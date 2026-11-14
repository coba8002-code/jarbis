// 작업 위험 단계·한꺼번에 승인(낮음만)·24시간 지난 대기 정리 검사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { MissionControl } from '../src/mission/missions.js';
import { tierOf } from '../src/mission/tiers.js';
import { tempDbPath } from './helpers.js';

function make() {
  const db = openDb(tempDbPath());
  const mc = new MissionControl(db, { executors: { 'mock.echo': async (m) => ({ echoed: m.content }), 'provider.send': async () => ({}) } });
  return { db, mc };
}
const low = (mc, text = 'a') => mc.create({ kind: 'mock.echo', title: '모의', target: 'local:mock', content: { text }, impact: '없음' });
const high = (mc) => mc.create({ kind: 'provider.send', title: '보내기', target: 'provider:x', content: { q: 1 }, impact: '외부 전송' });

test('위험 단계는 PC 규칙: 이 기기 읽기는 낮음, 외부 전송·모르는 작업은 높음', () => {
  assert.equal(tierOf('local.memory.search'), 'low');
  assert.equal(tierOf('provider.send'), 'high');
  assert.equal(tierOf('something.new'), 'high');
  const { db, mc } = make();
  assert.equal(low(mc).tier, 'low');
  assert.equal(high(mc).tier, 'high');
  db.close();
});

test('한꺼번에 승인: 낮음만, 본 내용 버전이 맞는 것만', () => {
  const { db, mc } = make();
  const a = low(mc, 'a');
  const b = low(mc, 'b');
  const h = high(mc);
  const r = mc.approveLow([{ id: a.id, version: a.content_version }, { id: b.id, version: 'old' }, { id: h.id, version: h.content_version }]);
  assert.deepEqual(r.map((x) => x.ok), [true, false, false]);
  assert.equal(r[1].error.code, 'version_mismatch');
  assert.equal(r[2].error.code, 'invalid_state');
  assert.equal(mc.get(a.id).status, 'approved');
  assert.equal(mc.get(h.id).status, 'pending');
  assert.throws(() => mc.approveLow([]), { code: 'invalid_input' });
  db.close();
});

test('24시간 넘게 기다린 승인 대기는 취소로 정리(실행 안 함), 승인된 것은 그대로', () => {
  const { db, mc } = make();
  const old = low(mc, 'old');
  const fresh = low(mc, 'fresh');
  const ok = low(mc, 'ok');
  mc.approve(ok.id, ok.content_version);
  db.prepare('UPDATE missions SET updated_at = ? WHERE id IN (?, ?)').run(new Date(Date.now() - 25 * 3600_000).toISOString(), old.id, ok.id);
  assert.deepEqual(mc.expireStale(), [old.id]);
  assert.equal(mc.get(old.id).status, 'cancelled');
  assert.match(mc.events(old.id).at(-1).note, /expired/);
  assert.equal(mc.get(fresh.id).status, 'pending');
  assert.equal(mc.get(ok.id).status, 'approved');
  db.close();
});
