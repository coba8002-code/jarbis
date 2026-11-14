// 듣기 모드 에코 판단(T219) 검사. 가짜 스피커·가짜 받아쓰기 서버만 쓴다(소리·마이크 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { checkEcho } from '../src/voice/echo.js';
import { SpeechPlayer } from '../src/voice/player.js';
import { makeWav } from '../src/voice/wav.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { tempDbPath } from './helpers.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const SPOKEN = '오늘 서울은 맑고 낮 최고 기온은 이십삼 도입니다. 저녁에는 바람이 조금 불겠습니다.';

test('에코 판단: 읽은 글을 다시 받아 적은 것은 에코, 다른 말·멈춤 말은 사용자 말', () => {
  // whisper가 띄어쓰기·숫자·문장 부호를 다르게 적어도 에코로 본다(앞부분만 들린 경우 포함)
  assert.equal(checkEcho('오늘 서울은 맑고 낮 최고 기온은 이십삼도입니다', SPOKEN).echo, true);
  assert.equal(checkEcho('저녁에는 바람이 조금', SPOKEN).echo, true);
  assert.equal(checkEcho('', SPOKEN).echo, true); // 말소리 없음
  assert.equal(checkEcho('내일 회의 몇 시였지?', SPOKEN).echo, false);
  assert.equal(checkEcho('자비스 내일 일정 알려 줘', SPOKEN).echo, false);
  // 읽은 글과 겹쳐도 멈춤 말이 있으면 사용자 말
  assert.deepEqual(checkEcho('오늘 서울은 맑고 그만', SPOKEN), { echo: false, overlap: 0, reason: 'stop_word' });
  assert.equal(checkEcho('잠깐', SPOKEN).echo, false);
  // 읽은 것이 없으면 늘 사용자 말
  assert.deepEqual(checkEcho('오늘 서울은 맑고', ''), { echo: false, overlap: 0, reason: 'nothing_spoken' });
});

test('재생기는 지금 읽는 문장과 방금 끝난 문장만 기억한다', async () => {
  let now = 0;
  const handles = [];
  const speaker = { speak: (text) => { let end; const done = new Promise((r) => { end = r; }); handles.push({ text, end }); return { done, kill: () => end() }; } };
  const p = new SpeechPlayer({ speaker, now: () => now });
  p.play(1, '첫 문장. 둘째 문장. ');
  p.finish(1);
  assert.equal(p.recentText(), '첫 문장.'); // 읽는 중
  now = 1000; handles[0].end(); await tick();
  assert.equal(p.recentText(), '첫 문장. 둘째 문장.'); // 첫 문장은 방금 끝남
  now = 20000; handles[1].end(); await tick();
  assert.equal(p.recentText(8000), '둘째 문장.'); // 첫 문장은 19초 전에 끝나 빠짐
  now = 40000;
  assert.equal(p.recentText(8000), '');
  for (let i = 0; i < 12; i += 1) { p.play(2 + i, `문장 ${i}. `); p.finish(2 + i); handles.at(-1).end(); await tick(); }
  assert.ok(p.spoken.length <= 8); // 최근 8문장만 메모리에 둔다
});

test('화면 API: 말하는 중 /api/stt?echo=check 는 에코 여부를 알려 준다', async (t) => {
  let heard = '';
  const whisper = createServer((rq, rs) => { rq.resume(); rq.on('end', () => { rs.writeHead(200, { 'content-type': 'application/json' }); rs.end(JSON.stringify({ text: heard })); }); });
  await new Promise((r) => whisper.listen(0, '127.0.0.1', r));
  t.after(() => whisper.close());
  const speaker = { speak: () => { let end; const done = new Promise((r) => { end = r; }); setTimeout(end, 3000); return { done, kill: () => end() }; } };
  const providers = new ProviderRegistry({ mock: createMockProvider('mock', { chunks: [SPOKEN], delayMs: 1 }) });
  const services = createServices({ dataDir: dirname(tempDbPath()), providers, speaker, stt: { launcher: async () => ({ baseUrl: `http://127.0.0.1:${whisper.address().port}`, stop() {} }), ffmpeg: null } });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { services.voice.turns.cancel(); await app.close(); services.close(); });
  const base = `http://127.0.0.1:${port}`;
  const json = (path, method = 'GET', body) => fetch(base + path, { method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json());
  const stt = (q) => fetch(`${base}/api/stt${q}`, { method: 'POST', headers: { 'x-jarvis-token': app.token, 'content-type': 'audio/wav' }, body: makeWav(new Array(16000).fill(800)) }).then((r) => r.json());

  heard = '오늘 서울은 맑고 낮 최고 기온은';
  assert.equal((await stt('?echo=check')).echo, false); // 아직 아무것도 읽지 않음

  await json('/api/voice', 'PUT', { enabled: true });
  await json('/api/chat', 'POST', { provider: 'mock', question: '날씨' });
  while ((await json('/api/voice')).state !== 'speaking') await tick();
  const echo = await stt('?echo=check');
  assert.equal(echo.echo, true);
  assert.equal(echo.echoReason, 'matches_spoken');
  heard = '자비스 내일 일정 알려 줘';
  const user = await stt('?echo=check');
  assert.equal(user.echo, false);
  assert.equal(user.text, '자비스 내일 일정 알려 줘');
  assert.equal((await stt('')).echo, undefined); // 말하기 버튼 경로는 판단하지 않음
  assert.equal((await json('/api/voice')).state, 'speaking'); // 판단만 하고 읽던 답은 멈추지 않는다(멈춤은 화면이 결정)
});
