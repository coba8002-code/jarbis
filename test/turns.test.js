// 끼어들기·오래된 응답 폐기 (FR-002) 로직 검사. 마이크·스피커 대신 가짜 재생기를 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnManager } from '../src/conversation/turns.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';

const req = { messages: [{ role: 'user', content: '안녕' }] };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function fakePlayer() {
  const log = [];
  return {
    log,
    played: (id) => log.filter((x) => x.op === 'play' && x.turnId === id).map((x) => x.text),
    play: (turnId, text) => log.push({ op: 'play', turnId, text }),
    stop: (turnId) => log.push({ op: 'stop', turnId }),
    finish: (turnId) => log.push({ op: 'finish', turnId }),
  };
}

// 취소 신호를 무시하고 계속 보내는 공급자 (오래된 응답 폐기 검사용).
function stubborn(chunks, delay = 10) {
  return {
    name: 'stubborn',
    async *stream() {
      for (const text of chunks) {
        await tick(delay);
        yield { type: 'delta', text };
      }
      yield { type: 'done', finishReason: 'stop' };
    },
  };
}

function setup(extra = {}) {
  const player = fakePlayer();
  const providers = new ProviderRegistry({
    mock: createMockProvider('mock', { chunks: ['하나', '둘', '셋'], delayMs: 10 }),
    ...extra,
  });
  const tm = new TurnManager({ providers, player });
  const states = [];
  tm.on((e) => { if (e.type === 'state') states.push(e.state); });
  return { tm, player, states };
}

test('정상 흐름: 생각 → 말하기 → 재생 끝 → 대기', async () => {
  const { tm, player, states } = setup();
  const turn = await tm.submit('mock', req);
  assert.equal(turn.status, 'generated');
  assert.equal(tm.state, 'speaking');
  assert.deepEqual(player.played(1), ['하나', '둘', '셋']);
  assert.deepEqual(player.log.at(-1), { op: 'finish', turnId: 1 });
  assert.equal(tm.playbackEnded(1), true);
  assert.equal(tm.state, 'idle');
  assert.deepEqual(states, ['thinking', 'speaking', 'idle']);
  assert.equal(tm.history()[0].text, '하나둘셋');
});

test('말하는 중 끼어들면 생성과 재생을 함께 멈춘다', async () => {
  const { tm, player } = setup();
  const p = tm.submit('mock', req);
  while (player.played(1).length < 1) await tick(1);
  tm.userSpeechStarted();
  const turn = await p;
  assert.equal(turn.status, 'interrupted');
  assert.equal(tm.state, 'listening');
  assert.ok(player.log.some((x) => x.op === 'stop' && x.turnId === 1));
  assert.deepEqual(player.played(1), ['하나']);
  await tick(50);
  assert.deepEqual(player.played(1), ['하나']);
});

test('생각 중(소리 전) 끼어들면 재생 없이 끊는다', async () => {
  const { tm, player } = setup();
  const p = tm.submit('mock', req);
  tm.userSpeechStarted();
  const turn = await p;
  assert.equal(turn.status, 'interrupted');
  assert.deepEqual(player.log, []);
});

test('취소를 무시하는 공급자의 늦은 조각도 버린다', async () => {
  const { tm, player } = setup({ stubborn: stubborn(['옛1', '옛2', '옛3', '옛4']) });
  const p = tm.submit('stubborn', req);
  while (player.played(1).length < 1) await tick(1);
  tm.userSpeechStarted();
  const old = await p;
  assert.equal(old.status, 'interrupted');
  assert.deepEqual(player.played(1), ['옛1']);
  assert.equal(old.text, '옛1');
  assert.ok(tm.discarded >= 3, `버린 조각 ${tm.discarded}`);
});

test('새 질문이 오면 옛 차례를 끊고 새 차례만 재생한다', async () => {
  const { tm, player } = setup({ stubborn: stubborn(['옛1', '옛2', '옛3'], 15) });
  const p1 = tm.submit('stubborn', req);
  while (player.played(1).length < 1) await tick(1);
  const p2 = tm.submit('mock', req);
  const [t1, t2] = await Promise.all([p1, p2]);
  assert.equal(t1.status, 'interrupted');
  assert.equal(t1.reason, 'new_turn');
  assert.equal(t2.status, 'generated');
  assert.deepEqual(player.played(1), ['옛1']);
  assert.deepEqual(player.played(2), ['하나', '둘', '셋']);
  const lastOld = player.log.findLastIndex((x) => x.turnId === 1 && x.op === 'play');
  const firstNew = player.log.findIndex((x) => x.turnId === 2);
  assert.ok(lastOld < firstNew, '옛 조각이 새 차례 뒤에 재생됨');
});

test('끊긴 옛 차례의 재생 끝 신호는 무시한다', async () => {
  const { tm } = setup();
  await tm.submit('mock', req);
  tm.userSpeechStarted();
  const p = tm.submit('mock', req);
  assert.equal(tm.playbackEnded(1), false);
  await p;
  assert.equal(tm.state, 'speaking');
  assert.equal(tm.playbackEnded(2), true);
  assert.equal(tm.state, 'idle');
});

test('재생이 끝난 차례(생성 완료 후 재생 중)도 끼어들면 멈춘다', async () => {
  const { tm, player } = setup();
  await tm.submit('mock', req);
  tm.userSpeechStarted();
  assert.ok(player.log.some((x) => x.op === 'stop' && x.turnId === 1));
  assert.equal(tm.history()[0].status, 'interrupted');
});

test('연속 세 번 끼어들어도 마지막 차례만 끝까지 재생된다', async () => {
  const { tm, player } = setup();
  const runs = [];
  for (let i = 0; i < 3; i += 1) {
    runs.push(tm.submit('mock', req));
    await tick(12);
    tm.userSpeechStarted();
  }
  runs.push(tm.submit('mock', req));
  const results = await Promise.all(runs);
  assert.deepEqual(results.map((r) => r.status), ['interrupted', 'interrupted', 'interrupted', 'generated']);
  assert.deepEqual(player.played(4), ['하나', '둘', '셋']);
  for (const id of [1, 2, 3]) assert.ok(player.played(id).length < 3);
});

test('공급자 오류: 실패로 기록하고 대기로, 다른 공급자로 넘기지 않는다', async () => {
  let backupCalls = 0;
  const { tm, player } = setup({
    bad: createMockProvider('bad', { failWith: 'unavailable', failAfter: 1 }),
    backup: { name: 'backup', async *stream() { backupCalls += 1; yield { type: 'done' }; } },
  });
  const turn = await tm.submit('bad', req);
  assert.equal(turn.status, 'failed');
  assert.equal(turn.error.code, 'unavailable');
  assert.equal(tm.state, 'idle');
  assert.ok(player.log.some((x) => x.op === 'stop' && x.turnId === 1));
  assert.equal(backupCalls, 0);
});

// 2026-11-14 독립 QA: 화면 연결이 끊기면 그 차례만 끊는다. 옛 요청의 연결 끊김이 새 차례를 끊으면 안 된다.
test('연결 끊김 신호: 자기 차례만 끊고, 이미 새 차례가 시작됐으면 새 차례는 그대로 둔다', async () => {
  const { tm, player } = setup();
  const first = new AbortController();
  const a = tm.submit('mock', req, { signal: first.signal });
  await tick(1);
  const second = new AbortController();
  const b = tm.submit('mock', req, { signal: second.signal }); // 새 질문이 옛 차례를 끊음
  await tick(1);
  first.abort(); // 옛 요청 연결이 늦게 끊김
  const tb = await b;
  assert.equal((await a).status, 'interrupted');
  assert.equal(tb.status, 'generated', '새 차례는 끊기지 않음');
  assert.deepEqual(player.played(2), ['하나', '둘', '셋']);
});

test('연결 끊김 신호: 생성 중인 지금 차례를 끊고 대기로 돌아간다', async () => {
  const { tm } = setup();
  const gone = new AbortController();
  const p = tm.submit('mock', req, { signal: gone.signal });
  await tick(1);
  gone.abort();
  const turn = await p;
  assert.equal(turn.status, 'interrupted');
  assert.equal(turn.reason, 'client_gone');
  assert.equal(tm.state, 'idle');
});
