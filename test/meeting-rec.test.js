// 메인 화면 회의 녹음(meeting-rec.js)의 조각 나누기 규칙. 마이크·화면 없이 규칙만 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldFlush, fmtMs, CHUNK_MIN_MS, CHUNK_MAX_MS, MAX_MS } from '../src/server/public/meeting-rec.js';

test('조각 나누기: 15초 전에는 안 보내고, 15~30초는 말이 멈췄을 때, 30초가 넘으면 바로 보낸다', () => {
  assert.equal(shouldFlush(CHUNK_MIN_MS - 1, false), false);
  assert.equal(shouldFlush(CHUNK_MIN_MS, true), false);
  assert.equal(shouldFlush(CHUNK_MIN_MS, false), true);
  assert.equal(shouldFlush(CHUNK_MAX_MS, true), true);
  assert.equal(MAX_MS, 2 * 60 * 60 * 1000, '설정 화면 회의 녹음과 같은 최대 2시간');
});

test('시간 표시는 분:초', () => {
  assert.equal(fmtMs(0), '00:00');
  assert.equal(fmtMs(65_400), '01:05');
  assert.equal(fmtMs(3_600_000), '60:00');
});
