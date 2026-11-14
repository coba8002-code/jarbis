// 회의 기록 시간·삭제·복원 규칙 (FR-008). 실제 녹음 없이 가짜 원음 파일을 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDb } from '../src/store/db.js';
import { MeetingStore } from '../src/meeting/meetings.js';
import { tempDbPath } from './helpers.js';

function setup(t, path = tempDbPath(), fs) {
  const db = openDb(path);
  t.after(() => { try { db.close(); } catch { /* 이미 닫힘 */ } });
  const audioDir = join(dirname(path), 'meetings');
  mkdirSync(audioDir, { recursive: true });
  const store = new MeetingStore(db, fs ? { audioDir, fs } : { audioDir });
  const fakeAudio = (id) => writeFileSync(store.audioPath(id), 'RIFF-fake');
  return { db, path, store, audioDir, fakeAudio };
}

test('시작하면 녹음 중이고, 동시에 두 회의는 녹음하지 않는다', (t) => {
  const { store } = setup(t);
  const m = store.start('주간 회의');
  assert.equal(m.status, 'recording');
  assert.equal(store.recording().id, m.id);
  assert.throws(() => store.start('두 번째'), { code: 'invalid_state' });
  store.stop(m.id, 60000);
  assert.equal(store.recording(), null);
  assert.equal(store.start('두 번째').status, 'recording');
});

test('녹취 시간은 0 이상, 끝 > 시작, 순서가 뒤집히지 않는다', (t) => {
  const { store } = setup(t);
  const m = store.start('회의');
  store.addSegment(m.id, { startMs: 0, endMs: 1500, text: '안녕하세요' });
  store.addSegment(m.id, { startMs: 1500, endMs: 3000, text: '시작할게요' });
  store.addSegment(m.id, { startMs: 1500, endMs: 2000, text: '같은 시작은 허용' });
  assert.throws(() => store.addSegment(m.id, { startMs: 1000, endMs: 4000, text: '앞섬' }), { code: 'invalid_input' });
  assert.throws(() => store.addSegment(m.id, { startMs: -1, endMs: 10, text: 'x' }), { code: 'invalid_input' });
  assert.throws(() => store.addSegment(m.id, { startMs: 5000, endMs: 5000, text: 'x' }), { code: 'invalid_input' });
  assert.throws(() => store.addSegment(m.id, { startMs: 1.5, endMs: 10, text: 'x' }), { code: 'invalid_input' });
  assert.throws(() => store.addSegment(m.id, { startMs: 4000, endMs: 5000, text: ' ' }), { code: 'invalid_input' });
  const segs = store.segments(m.id);
  assert.equal(segs.length, 3);
  for (let i = 1; i < segs.length; i += 1) assert.ok(segs[i].start_ms >= segs[i - 1].start_ms);
});

test('멈출 때 음성 길이를 넘는 구간은 자르고, 길이 밖에서 시작한 구간은 지운다', (t) => {
  const { store } = setup(t);
  const m = store.start('회의');
  store.addSegment(m.id, { startMs: 0, endMs: 9000, text: '정상' });
  store.addSegment(m.id, { startMs: 9000, endMs: 10400, text: '살짝 넘침' });
  store.addSegment(m.id, { startMs: 10000, endMs: 11000, text: '길이 밖' });
  const r = store.stop(m.id, 10000);
  assert.equal(r.clamped, 1);
  assert.equal(r.dropped, 1);
  const segs = store.segments(m.id);
  assert.deepEqual(segs.map((s) => [s.start_ms, s.end_ms]), [[0, 9000], [9000, 10000]]);
  for (const s of segs) assert.ok(s.end_ms <= r.meeting.duration_ms);
});

test('멈춘 뒤 오는 구간도 길이 규칙을 따른다', (t) => {
  const { store } = setup(t);
  const m = store.start('회의');
  store.stop(m.id, 5000);
  const s = store.addSegment(m.id, { startMs: 4000, endMs: 6000, text: '늦게 온 녹취' });
  assert.equal(s.end_ms, 5000);
  assert.throws(() => store.addSegment(m.id, { startMs: 5000, endMs: 5500, text: 'x' }), { code: 'invalid_input' });
  assert.throws(() => store.stop(m.id, 6000), { code: 'invalid_state' });
});

test('시간을 누르면 그 구간 시작 위치를 돌려주고, 원음이 없으면 알린다', (t) => {
  const { store, fakeAudio } = setup(t);
  const m = store.start('회의');
  const s = store.addSegment(m.id, { startMs: 2500, endMs: 4000, text: '여기' });
  store.stop(m.id, 8000);
  assert.throws(() => store.seek(m.id, s.id), (e) => e.code === 'not_found' && /원음/.test(e.message));
  fakeAudio(m.id);
  const pos = store.seek(m.id, s.id);
  assert.equal(pos.offsetMs, 2500);
  assert.equal(pos.endMs, 4000);
  assert.ok(existsSync(pos.audioPath));
  assert.throws(() => store.seek(m.id, 999), { code: 'not_found' });
});

test('원음만, 녹취만, 회의 전체를 각각 지울 수 있다', (t) => {
  const { store, fakeAudio, db } = setup(t);
  const a = store.start('A');
  store.addSegment(a.id, { startMs: 0, endMs: 1000, text: 'a' });
  store.stop(a.id, 2000);
  fakeAudio(a.id);
  store.deleteAudio(a.id);
  assert.equal(existsSync(store.audioPath(a.id)), false);
  assert.equal(store.segments(a.id).length, 1);
  assert.equal(store.deleteTranscript(a.id).segmentsDeleted, 1);
  assert.equal(store.segments(a.id).length, 0);

  const b = store.start('B');
  store.addSegment(b.id, { startMs: 0, endMs: 1000, text: '지울 녹취' });
  store.stop(b.id, 2000);
  fakeAudio(b.id);
  const path = store.audioPath(b.id);
  store.delete(b.id);
  assert.equal(existsSync(path), false);
  assert.throws(() => store.get(b.id), { code: 'not_found' });
  assert.equal(db.prepare("SELECT count(*) AS n FROM transcript_segments WHERE text = '지울 녹취'").get().n, 0);
});

test('녹음 중인 회의는 바로 지우지 않는다', (t) => {
  const { store } = setup(t);
  const m = store.start('회의');
  assert.throws(() => store.delete(m.id), { code: 'invalid_state' });
});

test('원음 삭제가 실패하면 기록을 지우지 않고 오류를 알린다', (t) => {
  const failingFs = { existsSync: () => true, unlinkSync: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } };
  const { store } = setup(t, undefined, failingFs);
  const m = store.start('회의');
  store.addSegment(m.id, { startMs: 0, endMs: 1000, text: '남아야 함' });
  store.stop(m.id, 2000);
  assert.throws(() => store.delete(m.id), (e) => e.code === 'storage_error' && /EBUSY/.test(e.message));
  assert.equal(store.get(m.id).status, 'stopped');
  assert.equal(store.segments(m.id).length, 1);
});

test('녹음 중에 앱이 꺼지면 재시작 때 중단으로 두고 녹취는 남긴다', (t) => {
  const first = setup(t);
  const m = first.store.start('회의');
  first.store.addSegment(m.id, { startMs: 0, endMs: 1000, text: '꺼지기 전' });
  first.db.close();
  const second = setup(t, first.path);
  assert.deepEqual(second.store.recoverInterrupted(), [m.id]);
  assert.equal(second.store.get(m.id).status, 'interrupted');
  assert.equal(second.store.segments(m.id)[0].text, '꺼지기 전');
  assert.equal(second.store.start('새 회의').status, 'recording');
});

test('원음 파일 이름이 저장 폴더 밖을 가리키면 거부한다', (t) => {
  const { store, db } = setup(t);
  const m = store.start('회의');
  store.stop(m.id, 1000);
  db.prepare('UPDATE meetings SET audio_file = ? WHERE id = ?').run('../../outside.wav', m.id);
  assert.throws(() => store.audioPath(m.id), { code: 'invalid_state' });
  assert.throws(() => store.delete(m.id), { code: 'invalid_state' });
  assert.equal(store.get(m.id).status, 'stopped');
});
