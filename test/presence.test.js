// 사람이 왔는지 판단(2026-11-14). 카메라·센서 없이 계산만 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGray, motionScore, createPresence, DEFAULTS } from '../src/server/public/presence.js';

const flat = (v, n = 768) => new Uint8Array(n).fill(v);
// 왼쪽 절반만 밝은 그림(사람이 들어온 장면처럼 모양이 다름)
const half = (n = 768) => Uint8Array.from({ length: n }, (_, i) => (i % 32 < 16 ? 200 : 40));

test('회색 바꾸기와 움직임 점수: 전체 밝기만 바뀌면 0, 모양이 바뀌면 큼', () => {
  assert.deepEqual([...toGray(Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255]))], [255, 0]);
  assert.equal(motionScore(flat(80), flat(80)), 0);
  assert.equal(motionScore(flat(60), flat(160)), 0, '카메라가 켜지며 밝기만 바뀐 것은 움직임이 아님');
  assert.ok(motionScore(flat(100), half()) > DEFAULTS.motionThreshold);
  assert.equal(motionScore(flat(1, 4), flat(1, 8)), 0, '크기가 다르면 비교하지 않음');
});

test('상태: 손 안 대면 1분 뒤 idle, 3분 뒤 쉬는 화면, 누르면 바로 깨어남', () => {
  const p = createPresence();
  p.start(0);
  assert.equal(p.tick(59_000), false);
  assert.equal(p.tick(60_000), true);
  assert.equal(p.state, 'idle');
  assert.equal(p.tick(180_000), true);
  assert.equal(p.state, 'asleep');
  assert.equal(p.activity(181_000), true);
  assert.equal(p.state, 'awake');
  assert.equal(p.reason, 'touch');
  assert.equal(p.activity(182_000), false, '이미 깨어 있으면 바뀜 없음');
});

test('카메라 잠깐 보기는 쓰는 중에는 안 하고, idle 15초·쉬는 화면 30초마다 한 번', () => {
  const p = createPresence();
  p.start(0);
  assert.equal(p.shouldGlance(10_000), false, '쓰는 중에는 카메라를 켜지 않음');
  p.tick(60_000);
  assert.equal(p.shouldGlance(60_000), true);
  p.glance(60_000, flat(90), flat(90));
  assert.equal(p.shouldGlance(70_000), false);
  assert.equal(p.shouldGlance(75_000), true);
  p.tick(180_000);
  p.glance(180_000, flat(90), flat(90));
  assert.equal(p.state, 'asleep');
  assert.equal(p.shouldGlance(200_000), false);
  assert.equal(p.shouldGlance(210_000), true);
});

test('잠깐 보기: 그대로면 계속 쉼, 움직임이나 지난번과 다른 장면이면 깨어남, 근접 센서도 깨움', () => {
  const p = createPresence();
  p.start(0);
  p.tick(200_000);
  assert.equal(p.glance(200_000, flat(90), flat(90)).seen, false);
  assert.equal(p.state, 'asleep');
  // 가만히 서 있는 사람: 두 장 사이 움직임은 없지만 지난번 장면과 다름
  const r = p.glance(230_000, half(), half());
  assert.equal(r.seen, true);
  assert.ok(r.changed > DEFAULTS.motionThreshold && r.moving === 0);
  assert.equal(p.state, 'awake');
  assert.equal(p.reason, 'camera');
  p.tick(500_000);
  // 같은 장면이 이어지면 다시 깨우지 않음
  assert.equal(p.glance(500_000, half(), half()).seen, false);
  assert.equal(p.near(501_000), true);
  assert.equal(p.reason, 'near');
  p.forget();
  p.tick(800_000);
  assert.equal(p.glance(800_000, half(), half()).seen, false, '잊은 뒤 첫 그림은 비교 기준만 됨');
});

test('얼굴 판정: 얼굴이 있으면 깨어나고, 얼굴 없음(모델이 돌았음)이면 움직임이 커도 안 깨어남(반사·조명 오탐 줄이기)', () => {
  const p = createPresence();
  p.start(0);
  p.tick(200_000);
  assert.equal(p.state, 'asleep');
  // 움직임은 크지만 얼굴이 없음 → 화면 반사·조명 변화로 보고 안 깨어남
  assert.equal(p.glance(200_000, flat(100), half(), false).person, false);
  assert.equal(p.state, 'asleep');
  // 움직임이 없어도 얼굴이 있으면 깨어남(가만히 선 사람)
  const r = p.glance(230_000, flat(90), flat(90), true);
  assert.equal(r.person, true);
  assert.equal(r.changedState, true);
  assert.equal(p.state, 'awake');
  assert.equal(p.reason, 'camera');
});

test('사람 떠남: 깨어 있을 때 얼굴 없음이 연속 2번 이상이고 마지막 확인 뒤 75초 지나면 쉬는 화면으로', () => {
  const p = createPresence();
  p.start(0); // lastPerson=0
  assert.equal(p.glance(30_000, flat(90), flat(90), false).changedState, false, '아직 75초 안 됨');
  assert.equal(p.state, 'awake');
  assert.equal(p.glance(60_000, flat(90), flat(90), false).changedState, false, '2번째지만 75초 전');
  const r = p.glance(80_000, flat(90), flat(90), false);
  assert.equal(r.changedState, true);
  assert.equal(p.state, 'asleep');
  assert.equal(p.reason, 'absent');
});

test('떠남 판단은 활동으로 리셋되고, 모델이 없으면(얼굴 미확인) 움직임만으로는 재우지 않는다', () => {
  const p = createPresence();
  p.start(0);
  p.glance(40_000, flat(90), flat(90), false); // 없음 1번
  p.activity(50_000); // 누름 → 사람 있음으로 리셋
  assert.equal(p.glance(120_000, flat(90), flat(90), false).changedState, false, '리셋 뒤 75초 안 지남');
  assert.equal(p.state, 'awake');
  // 모델이 없을 때(faceSeen 미지정): 움직임 0이어도 떠남으로 세지 않음(가만히 있는 사람 보호)
  const p2 = createPresence();
  p2.start(0);
  assert.equal(p2.glance(200_000, flat(90), flat(90)).changedState, false);
  assert.equal(p2.glance(300_000, flat(90), flat(90)).changedState, false, '얼굴 미확인이면 안 잠');
  assert.equal(p2.state, 'awake');
});
