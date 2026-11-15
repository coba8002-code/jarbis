// 캐릭터 모션 검사(docs/CHARACTER_MOTION.md). 화면 없이 고르기 규칙만 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOTIONS, EMOTES, MAX_EMOTES, TEMPERAMENTS, temperamentOf, pickFidget, idleGap, emotionOf, pokeLevel, emoteRoom, IDLE_GAP } from '../src/server/public/motion.js';

// 정해진 순서로 0~1 값을 내는 가짜 난수
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('동작 16가지: 길이·우선순위가 있고, 감정 표시는 아는 종류만', () => {
  assert.equal(Object.keys(MOTIONS).length, 16);
  for (const [k, m] of Object.entries(MOTIONS)) {
    assert.ok(m.dur >= 400 && m.dur <= 2400, k);
    assert.ok([1, 2].includes(m.pri), k);
    assert.ok(m.ko, k);
    if (m.emote) { assert.ok(EMOTES.includes(m.emote[0]), k); assert.ok(m.emote[1] >= 1 && m.emote[1] <= MAX_EMOTES, k); }
  }
  for (const t of Object.values(TEMPERAMENTS)) for (const k of Object.keys(t.weights)) assert.ok(MOTIONS[k], k);
});

test('친구별 성격: 늘보·카피 느긋, 토리·콩이·몽이·솔이 활발, 기니·나비 수줍, 나머지 보통', () => {
  for (const n of ['늘보', '카피']) assert.equal(temperamentOf(n), 'calm');
  for (const n of ['토리', '콩이', '몽이', '솔이']) assert.equal(temperamentOf(n), 'lively');
  for (const n of ['기니', '나비']) assert.equal(temperamentOf(n), 'shy');
  for (const n of ['자비', '곰돌', '여우비', 'JARVIS', '', null]) assert.equal(temperamentOf(n), 'normal');
  assert.ok(TEMPERAMENTS.calm.speed > 1 && TEMPERAMENTS.lively.speed < 1);
});

test('대기 잔동작: 방금 한 것은 다시 고르지 않고, 성격 비율을 따른다', () => {
  for (let i = 0; i < 200; i += 1) {
    const last = ['tilt', 'peek', 'wiggle', 'bounce', 'stretch'][i % 5];
    assert.notEqual(pickFidget({ rand: Math.random, last, temperament: ['calm', 'lively', 'shy', 'normal'][i % 4] }), last);
  }
  const count = (temperament) => {
    const c = {};
    let r = 0;
    const rand = () => { r = (r + 0.6180339887) % 1; return r; };
    for (let i = 0; i < 2000; i += 1) { const k = pickFidget({ rand, temperament }); c[k] = (c[k] ?? 0) + 1; }
    return c;
  };
  const calm = count('calm');
  const lively = count('lively');
  assert.ok(calm.stretch > calm.bounce * 2, '느긋한 친구는 기지개가 많다');
  assert.ok(lively.bounce > lively.stretch * 2, '활발한 친구는 콩콩이 많다');
  assert.equal(pickFidget({ rand: seq(0), temperament: 'normal' }), 'tilt');
  assert.equal(pickFidget({ rand: seq(0.9999), temperament: 'normal' }), 'stretch');
});

test('잔동작 간격: 7~15초, 느긋하면 길게, 활발하면 짧게', () => {
  assert.equal(idleGap({ rand: seq(0) }), IDLE_GAP[0]);
  assert.equal(idleGap({ rand: seq(1) }), IDLE_GAP[1]);
  assert.ok(idleGap({ rand: seq(0.5), temperament: 'calm' }) > idleGap({ rand: seq(0.5) }));
  assert.ok(idleGap({ rand: seq(0.5), temperament: 'lively' }) < idleGap({ rand: seq(0.5) }));
});

test('답 내용 반응: 축하 콩콩, 고마움 수줍, 미안 시무룩, 노래 둠칫, 물음표 갸웃, 그 밖은 없음', () => {
  assert.equal(emotionOf('합격 축하해요! 정말 대단해요.').motion, 'bounce');
  assert.deepEqual(emotionOf('칭찬해 줘서 고마워요.'), { motion: 'shy', emote: ['heart', 2] });
  assert.equal(emotionOf('미안해요, 그건 찾지 못했어요.').motion, 'sad');
  assert.equal(emotionOf('신나는 노래를 틀어 볼까요').motion, 'bounce', '앞 규칙(신나)이 먼저');
  assert.equal(emotionOf('잔잔한 음악 어때요').motion, 'dance');
  assert.deepEqual(emotionOf('오늘 저녁은 뭐 먹을까요?'), { motion: 'tilt', emote: ['question', 1] });
  assert.equal(emotionOf('오늘은 맑고 기온은 12도예요.'), null);
  assert.equal(emotionOf(''), null);
  assert.equal(emotionOf(null), null);
});

test('얼굴 누르기: 한 번 꼬물꼬물, 두 번 콩콩, 세 번 이상 빙그르', () => {
  assert.equal(pokeLevel(1).motion, 'wiggle');
  assert.equal(pokeLevel(2).motion, 'bounce');
  assert.equal(pokeLevel(3).motion, 'spin');
  assert.equal(pokeLevel(9).emote[1], 3);
});

test('감정 표시는 한 번에 6개까지만', () => {
  assert.equal(emoteRoom(0, 3), 3);
  assert.equal(emoteRoom(5, 3), 1);
  assert.equal(emoteRoom(6, 2), 0);
  assert.equal(emoteRoom(9, 2), 0);
});
