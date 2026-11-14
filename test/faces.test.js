// 얼굴 알아보기 계산·보관 형식(2026-11-14). 진짜 얼굴 없이 숫자로만 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distance, parseFaces, addPerson, removePerson, bestMatch, MAX_PEOPLE, MATCH_THRESHOLD } from '../src/server/public/faces.js';

const vec = (v, at = 0, bump = 0) => Array.from({ length: 128 }, (_, i) => (i === at ? v + bump : v));
const now = '2026-11-14T00:00:00.000Z';

test('거리와 가장 가까운 사람: 기준보다 멀면 모르는 사람', () => {
  assert.equal(distance(vec(0), vec(0)), 0);
  let list = addPerson([], { id: 'a', name: '준혁', consent: true, samples: [vec(0.1), vec(0.1, 3, 0.05)], now });
  list = addPerson(list, { id: 'b', name: '가족', consent: true, samples: [vec(0.4)], now });
  assert.equal(bestMatch(list, vec(0.1, 5, 0.1)).name, '준혁');
  assert.equal(bestMatch(list, vec(0.41)).name, '가족');
  assert.equal(bestMatch(list, vec(0.9)), null, '아무와도 멀면 null');
  assert.equal(bestMatch(list, [1, 2, 3]), null);
  assert.ok(MATCH_THRESHOLD < 0.6);
});

test('등록 규칙: 이름·동의·얼굴 특징이 있어야 하고, 같은 이름은 바꾸며, 최대 인원을 넘지 않는다', () => {
  assert.throws(() => addPerson([], { id: 'a', name: ' ', consent: true, samples: [vec(0)], now }), /이름/);
  assert.throws(() => addPerson([], { id: 'a', name: '준혁', consent: false, samples: [vec(0)], now }), /동의/);
  assert.throws(() => addPerson([], { id: 'a', name: '준혁', consent: true, samples: [], now }), /찍지 못했/);
  assert.throws(() => addPerson([], { id: 'a', name: '준혁', consent: true, samples: [[1, 2]], now }), /찍지 못했/);
  let list = addPerson([], { id: 'a', name: '준혁', consent: true, samples: [Float32Array.from(vec(0.1))], now });
  list = addPerson(list, { id: 'a2', name: '준혁', consent: true, samples: [vec(0.2)], now });
  assert.equal(list.length, 1, '같은 이름은 얼굴만 바꿈');
  assert.equal(list[0].samples[0][0], 0.2);
  for (let i = 1; i < MAX_PEOPLE; i += 1) list = addPerson(list, { id: `p${i}`, name: `사람${i}`, consent: true, samples: [vec(i)], now });
  assert.throws(() => addPerson(list, { id: 'x', name: '한 명 더', consent: true, samples: [vec(0)], now }), /최대/);
  assert.equal(removePerson(list, 'p1').length, MAX_PEOPLE - 1);
});

test('저장된 글 읽기: 깨졌거나 동의 기록이 없는 항목은 버린다', () => {
  const good = { id: 'a', name: '준혁', consentAt: now, samples: [vec(0.1)] };
  assert.deepEqual(parseFaces(JSON.stringify([good])), [good]);
  assert.deepEqual(parseFaces('{깨짐'), []);
  assert.deepEqual(parseFaces(null), []);
  assert.deepEqual(parseFaces(JSON.stringify({ a: 1 })), []);
  const noConsent = { ...good, consentAt: undefined };
  const badVec = { ...good, id: 'c', samples: [vec(0).slice(1)] };
  const nan = { ...good, id: 'd', samples: [vec(Number.NaN)] };
  assert.deepEqual(parseFaces(JSON.stringify([noConsent, badVec, good])).map((p) => p.id), ['a']);
  assert.deepEqual(parseFaces(JSON.stringify([{ ...nan, samples: [vec(0).map((x, i) => (i ? x : 'x'))] }])), []);
});
