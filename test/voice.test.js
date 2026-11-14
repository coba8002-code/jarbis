// 음성 출력 계층 검사. 스피커 대신 기록만 하는 가짜 스피커를 쓴다(소리 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SentenceBuffer } from '../src/voice/sentences.js';
import { SpeechPlayer } from '../src/voice/player.js';
import { TurnManager } from '../src/conversation/turns.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { createSystemSpeaker } from '../src/voice/system-speaker.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function fakeSpeaker(ms = 15) {
  const log = [];
  return {
    log,
    spoken: () => log.filter((x) => x.op === 'done').map((x) => x.text),
    speak(text) {
      log.push({ op: 'start', text });
      let finish;
      const done = new Promise((resolve) => {
        const h = setTimeout(() => { log.push({ op: 'done', text }); resolve(); }, ms);
        finish = () => { clearTimeout(h); log.push({ op: 'killed', text }); resolve(); };
      });
      return { done, kill: () => finish() };
    },
  };
}

test('문장 나누기: 문장부호·줄바꿈·숫자 속 점·긴 문장', () => {
  const b = new SentenceBuffer({ maxLen: 30 });
  assert.deepEqual(b.push('안녕하세요. 반가'), ['안녕하세요.']);
  assert.deepEqual(b.push('워요! 오늘은'), ['반가워요!']);
  assert.deepEqual(b.push(' 3.5도예요?'), ['오늘은 3.5도예요?']);
  assert.deepEqual(b.push('끝'), []);
  assert.deepEqual(b.push('.'), []);
  assert.deepEqual(b.push('\n다음'), ['끝.']);
  assert.deepEqual(b.flush(), ['다음']);
  assert.deepEqual(b.push('정말?!'), ['정말?!']);
  const long = new SentenceBuffer({ maxLen: 10 });
  // 10자 안에서 마지막 띄어쓰기 앞까지 자른다. 남은 짧은 부분은 다음 조각이나 flush를 기다린다.
  assert.deepEqual(long.push('하나 둘 셋 넷 다섯 여섯'), ['하나 둘 셋 넷']);
  assert.deepEqual(long.flush(), ['다섯 여섯']);
  assert.deepEqual(long.push('띄어쓰기없는아주긴문장입니다'), ['띄어쓰기없는아주긴문']);
  assert.deepEqual(new SentenceBuffer().flush(), []);
});

test('재생기: 문장 순서대로 말하고 다 말한 뒤 한 번만 끝 신호', async () => {
  const sp = fakeSpeaker();
  const ended = [];
  const p = new SpeechPlayer({ speaker: sp, onEnded: (id) => ended.push(id) });
  p.play(1, '첫 문장입니다. 둘');
  p.play(1, '째 문장!');
  p.finish(1);
  p.finish(1);
  while (!ended.length) await tick();
  await tick(30);
  assert.deepEqual(sp.spoken(), ['첫 문장입니다.', '둘째 문장!']);
  assert.deepEqual(ended, [1]);
});

test('재생기: 끝 문장부호 없는 마지막 조각도 finish 때 말한다', async () => {
  const sp = fakeSpeaker(1);
  const ended = [];
  const p = new SpeechPlayer({ speaker: sp, onEnded: (id) => ended.push(id) });
  p.play(1, '마침표 없는 답');
  await tick(10);
  assert.deepEqual(sp.spoken(), []);
  p.finish(1);
  while (!ended.length) await tick();
  assert.deepEqual(sp.spoken(), ['마침표 없는 답']);
});

test('재생기: 멈추면 지금 말하는 것을 끊고 남은 문장은 버린다', async () => {
  const sp = fakeSpeaker(30);
  const ended = [];
  const p = new SpeechPlayer({ speaker: sp, onEnded: (id) => ended.push(id) });
  p.play(1, '하나. 둘. 셋. ');
  p.finish(1);
  await tick(5);
  p.stop(1);
  await tick(120);
  assert.deepEqual(sp.log.map((x) => x.op), ['start', 'killed']);
  assert.deepEqual(ended, []);
});

test('재생기: 새 차례가 오면 옛 차례를 끊는다', async () => {
  const sp = fakeSpeaker(20);
  const p = new SpeechPlayer({ speaker: sp });
  p.play(1, '옛 문장. 옛 둘. ');
  await tick(5);
  p.play(2, '새 문장. ');
  p.finish(2);
  await tick(100);
  assert.deepEqual(sp.spoken(), ['새 문장.']);
  assert.ok(sp.log.some((x) => x.op === 'killed' && x.text === '옛 문장.'));
  assert.ok(!sp.log.some((x) => x.text === '옛 둘.'));
});

test('재생기: 합성 실패는 알리고 다음 문장으로 넘어간다', async () => {
  const errors = [];
  const ended = [];
  let n = 0;
  const speaker = { speak: (text) => ({ done: (n++ === 0 ? Promise.reject(new Error('합성 실패')) : Promise.resolve()), kill() {} }) };
  const p = new SpeechPlayer({ speaker, onEnded: (id) => ended.push(id), onError: (id, e) => errors.push(e.message) });
  p.play(1, '하나. 둘. ');
  p.finish(1);
  while (!ended.length) await tick();
  assert.deepEqual(errors, ['합성 실패']);
  assert.equal(n, 2);
});

test('끼어들기 연결: 말하는 도중 끊으면 옛 답 문장이 더 나오지 않는다', async () => {
  const sp = fakeSpeaker(25);
  const providers = new ProviderRegistry({
    mock: createMockProvider('mock', { chunks: ['첫 문장. ', '두 번째 문장. ', '세 번째. '], delayMs: 5 }),
    short: createMockProvider('short', { chunks: ['새 답.'], delayMs: 1 }),
  });
  let tm;
  const player = new SpeechPlayer({ speaker: sp, onEnded: (id) => tm.playbackEnded(id) });
  tm = new TurnManager({ providers, player });
  const run = tm.submit('mock', { messages: [{ role: 'user', content: 'q' }] });
  while (!sp.log.length) await tick(1);
  tm.userSpeechStarted();
  await run;
  await tm.submit('short', { messages: [{ role: 'user', content: 'q2' }] });
  while (tm.state !== 'idle') await tick();
  await tick(60);
  assert.deepEqual(sp.spoken(), ['새 답.']);
  assert.ok(sp.log.some((x) => x.op === 'killed' && x.text === '첫 문장.'));
  assert.ok(!sp.log.some((x) => x.text.startsWith('두 번째') || x.text.startsWith('세 번째')));
});

test('끼어들기 없이 끝나면 재생 끝에 대기 상태로 돌아간다', async () => {
  const sp = fakeSpeaker(5);
  const providers = new ProviderRegistry({ mock: createMockProvider('mock', { chunks: ['짧은 답. ', '끝.'], delayMs: 1 }) });
  let tm;
  const player = new SpeechPlayer({ speaker: sp, onEnded: (id) => tm.playbackEnded(id) });
  tm = new TurnManager({ providers, player });
  await tm.submit('mock', { messages: [{ role: 'user', content: 'q' }] });
  while (tm.state !== 'idle') await tick();
  assert.deepEqual(sp.spoken(), ['짧은 답.', '끝.']);
});

test('지원하지 않는 OS는 tts_unavailable', () => {
  assert.throws(() => createSystemSpeaker({ platform: 'linux' }), { code: 'tts_unavailable' });
  assert.equal(createSystemSpeaker({ platform: 'darwin' }).platform, 'darwin');
  assert.equal(createSystemSpeaker({ platform: 'win32' }).platform, 'win32');
});
