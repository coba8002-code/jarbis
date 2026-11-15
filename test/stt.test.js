// 받아쓰기 연결 검사. 실제 whisper 대신 127.0.0.1 가짜 서버를 쓴다(마이크·외부 전송 없음).
// 형식 변환 검사는 이 기기의 ffmpeg가 있을 때만 돈다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { SpeechToText, createWhisperLauncher } from '../src/voice/stt.js';
import { parseWav, makeWav, isWhisperReady } from '../src/voice/wav.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

let hasFfmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { hasFfmpeg = false; }

const tone = (seconds, rate = 16000) => makeWav(Array.from({ length: Math.round(seconds * rate) }, (_, i) => 8000 * Math.sin(i / 10)), rate);

// 가짜 whisper-server: 받은 WAV를 기록하고 정해 둔 글을 돌려준다.
async function fakeWhisper({ text = ' 안녕하세요 ', status = 200 } = {}) {
  const got = [];
  const server = createServer((rq, rs) => {
    const chunks = [];
    rq.on('data', (c) => chunks.push(c));
    rq.on('end', () => {
      const body = Buffer.concat(chunks);
      const i = body.indexOf(Buffer.from('RIFF'));
      got.push({ url: rq.url, wav: i >= 0 ? parseWav(body.subarray(i)) : null });
      rs.writeHead(status, { 'content-type': 'application/json' });
      rs.end(status === 200 ? JSON.stringify({ text }) : '{"error":"x"}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { got, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function launcherFor(fake, counter = { starts: 0, stops: 0 }, delayMs = 0) {
  const launcher = async () => {
    counter.starts += 1;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return { baseUrl: fake.baseUrl, stop: () => { counter.stops += 1; } };
  };
  return { launcher, counter };
}

test('WAV 머리글 읽기와 whisper 형식 판단', () => {
  const w = tone(0.5);
  const info = parseWav(w);
  assert.deepEqual([info.format, info.channels, info.sampleRate, info.bits], [1, 1, 16000, 16]);
  assert.equal(Math.round(info.seconds * 10), 5);
  assert.equal(isWhisperReady(info), true);
  assert.equal(isWhisperReady(parseWav(tone(0.5, 22050))), false);
  assert.equal(parseWav(Buffer.from('not a wav file at all, definitely not')), null);
});

test('16kHz 모노 WAV는 그대로 보내고 앞뒤 공백을 지운 글을 돌려준다', async (t) => {
  const fake = await fakeWhisper();
  t.after(() => fake.server.close());
  const stt = new SpeechToText({ launcher: launcherFor(fake).launcher, ffmpeg: null });
  const r = await stt.transcribe(tone(1));
  assert.equal(r.text, '안녕하세요');
  assert.equal(r.converted, false);
  assert.equal(r.broken, false);
  assert.equal(fake.got[0].url, '/inference');
  assert.equal(fake.got[0].wav.sampleRate, 16000);
});

test('다른 형식은 ffmpeg로 16kHz 모노로 바꿔 보낸다', { skip: !hasFfmpeg && 'ffmpeg 없음' }, async (t) => {
  const fake = await fakeWhisper();
  t.after(() => fake.server.close());
  const stt = new SpeechToText({ launcher: launcherFor(fake).launcher });
  const r = await stt.transcribe(tone(1, 22050));
  assert.equal(r.converted, true);
  assert.deepEqual([fake.got[0].wav.sampleRate, fake.got[0].wav.channels], [16000, 1]);
  await assert.rejects(stt.transcribe(Buffer.from('음성이 아닌 글자 덩어리입니다')), { code: 'invalid_input' });
});

test('ffmpeg가 없으면 16kHz WAV가 아닌 파일은 stt_unavailable', async (t) => {
  const fake = await fakeWhisper();
  t.after(() => fake.server.close());
  const stt = new SpeechToText({ launcher: launcherFor(fake).launcher, ffmpeg: null });
  await assert.rejects(stt.transcribe(tone(1, 22050)), { code: 'stt_unavailable' });
  await assert.rejects(stt.transcribe(Buffer.alloc(0)), { code: 'invalid_input' });
  assert.equal(fake.got.length, 0);
});

test('너무 긴 음성은 보내지 않는다', async (t) => {
  const fake = await fakeWhisper();
  t.after(() => fake.server.close());
  const stt = new SpeechToText({ launcher: launcherFor(fake).launcher, ffmpeg: null, maxSeconds: 2 });
  await assert.rejects(stt.transcribe(tone(3)), (e) => e.code === 'invalid_input' && /너무 김/.test(e.message));
  assert.equal(fake.got.length, 0);
});

test('서버는 처음 받아쓸 때 한 번만 띄우고, 닫으면 끄고 다시 띄우지 않는다', async (t) => {
  const fake = await fakeWhisper();
  t.after(() => fake.server.close());
  const { launcher, counter } = launcherFor(fake, undefined, 30);
  const stt = new SpeechToText({ launcher, ffmpeg: null });
  assert.equal(stt.status().running, false);
  await Promise.all([stt.transcribe(tone(0.3)), stt.transcribe(tone(0.3)), stt.transcribe(tone(0.3))]);
  assert.equal(counter.starts, 1);
  assert.equal(stt.status().running, true);
  stt.close();
  assert.equal(counter.stops, 1);
  await assert.rejects(stt.transcribe(tone(0.3)), { code: 'stt_unavailable' });
  assert.equal(counter.starts, 1);
});

test('띄우는 도중 닫으면 다 뜬 서버를 바로 끈다', async (t) => {
  const fake = await fakeWhisper();
  t.after(() => fake.server.close());
  const { launcher, counter } = launcherFor(fake, undefined, 50);
  const stt = new SpeechToText({ launcher, ffmpeg: null });
  const pending = stt.transcribe(tone(0.3));
  await new Promise((r) => setTimeout(r, 10));
  stt.close();
  await assert.rejects(pending, { code: 'stt_unavailable' });
  assert.equal(counter.stops, 1);
});

test('서버 오류는 stt_failed, 연결이 끊기면 다시 띄워 한 번 재시도', async (t) => {
  const bad = await fakeWhisper({ status: 500 });
  t.after(() => bad.server.close());
  await assert.rejects(new SpeechToText({ launcher: launcherFor(bad).launcher, ffmpeg: null }).transcribe(tone(0.3)), { code: 'stt_failed' });

  const gone = await fakeWhisper();
  const ok = await fakeWhisper({ text: '다시 됨' });
  t.after(() => ok.server.close());
  let n = 0;
  const stt = new SpeechToText({ ffmpeg: null, launcher: async () => { n += 1; return { baseUrl: n === 1 ? gone.baseUrl : ok.baseUrl, stop() {} }; } });
  await new Promise((r) => gone.server.close(r));
  // 연결이 끊기면 같은 요청 안에서 엔진을 다시 띄워 한 번 재시도한다(2026-11-15)
  assert.equal((await stt.transcribe(tone(0.3))).text, '다시 됨');
  assert.equal(n, 2);
});

test('깨진 글자(U+FFFD)가 있으면 broken으로 알린다', async (t) => {
  const fake = await fakeWhisper({ text: '오\uFFFD 3시' });
  t.after(() => fake.server.close());
  assert.equal((await new SpeechToText({ launcher: launcherFor(fake).launcher, ffmpeg: null }).transcribe(tone(0.3))).broken, true);
});

test('엔진이 설정되지 않았거나 파일이 없으면 실행하지 않고 stt_unavailable', async () => {
  await assert.rejects(new SpeechToText({ ffmpeg: null }).transcribe(tone(0.3)), { code: 'stt_unavailable' });
  const missing = createWhisperLauncher({ server: 'C:/없는/폴더/whisper-server.exe', model: 'C:/없는/model.bin' });
  await assert.rejects(missing(), (e) => e.code === 'stt_unavailable' && /실행 파일이 없음/.test(e.message));
  const noModel = createWhisperLauncher({ server: process.execPath, model: 'C:/없는/model.bin' });
  await assert.rejects(noModel(), (e) => e.code === 'stt_unavailable' && /모델이 없음/.test(e.message));
});

async function startApp(t, stt) {
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) }, stt });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const call = (method, path, body, headers = {}) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, ...headers } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject);
    rq.end(body);
  });
  return { call, services, token: app.token, port };
}

test('화면 API: 음성 파일을 받아 적고, 형식·크기·토큰을 검사한다', async (t) => {
  const fake = await fakeWhisper({ text: ' 내일 회의 잡아 줘 ' });
  t.after(() => fake.server.close());
  const { launcher, counter } = launcherFor(fake);
  const { call } = await startApp(t, { launcher, ffmpeg: null });
  assert.deepEqual((await call('GET', '/api/stt')).json, { running: false, configured: true });
  const ok = await call('POST', '/api/stt', tone(1), { 'content-type': 'audio/wav' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.text, '내일 회의 잡아 줘');
  assert.equal((await call('GET', '/api/stt')).json.running, true);
  assert.equal((await call('POST', '/api/stt', '{"a":1}', { 'content-type': 'application/json' })).status, 400);
  const big = await call('POST', '/api/stt', Buffer.alloc(26 * 1024 * 1024), { 'content-type': 'audio/wav' });
  assert.equal(big.status, 413);
  assert.equal((await call('POST', '/api/stt', tone(1), { 'content-type': 'audio/wav', 'x-jarvis-token': 'wrong' })).status, 403);
  assert.equal(counter.starts, 1);
});

test('화면 API: 엔진이 없으면 503으로 알린다', async (t) => {
  const { call } = await startApp(t, undefined);
  const r = await call('POST', '/api/stt', tone(0.5), { 'content-type': 'audio/wav' });
  assert.equal(r.status, 503);
  assert.equal(r.json.error.code, 'stt_unavailable');
});

test('앱을 닫으면 받아쓰기 서버도 끈다', async (t) => {
  const fake = await fakeWhisper();
  t.after(() => fake.server.close());
  const { launcher, counter } = launcherFor(fake);
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) }, stt: { launcher, ffmpeg: null } });
  await services.stt.transcribe(tone(0.3));
  services.close();
  assert.equal(counter.stops, 1);
});

test('이름 바로잡기: 실측에서 나온 오인식만 "자비스"로, 조사·문장부호 유지', async () => {
  const { normalizeTranscript } = await import('../src/voice/stt.js');
  assert.equal(normalizeTranscript('차비스 오늘 날씨 어때'), '자비스 오늘 날씨 어때');
  assert.equal(normalizeTranscript('고마워 CHAVIS'), '고마워 자비스');
  assert.equal(normalizeTranscript('Javis 지금 몇시냐?'), '자비스 지금 몇시냐?');
  assert.equal(normalizeTranscript('차비스야, 회의 알려 줘'), '자비스야, 회의 알려 줘');
  assert.equal(normalizeTranscript('Jarvis, 차비스에게'), '자비스, 자비스에게');
  // 바꾸면 안 되는 말
  for (const s of ['차비 스타일', '자비로운 마음', '차 비스킷', '자비스 정상', '서비스 센터', 'Jarvisian']) assert.equal(normalizeTranscript(s), s, s);
});

test('받아쓰기 결과에 바로잡은 글과 원래 글을 함께 준다, 끌 수도 있다', async (t) => {
  const fake = await fakeWhisper({ text: ' 차비스 멈춰 ' });
  t.after(() => fake.server.close());
  const on = await new SpeechToText({ launcher: launcherFor(fake).launcher, ffmpeg: null }).transcribe(tone(0.3));
  assert.deepEqual([on.text, on.rawText], ['자비스 멈춰', '차비스 멈춰']);
  const off = await new SpeechToText({ launcher: launcherFor(fake).launcher, ffmpeg: null, normalize: false }).transcribe(tone(0.3));
  assert.equal(off.text, '차비스 멈춰');
  assert.equal(off.rawText, undefined);
});

test('받아쓰기 프롬프트는 영문만 허용(한글 프롬프트는 서버 응답 한글을 깨뜨림)', () => {
  assert.throws(() => createWhisperLauncher({ server: 'x', model: 'y', prompt: '자비스' }), { code: 'invalid_input' });
  assert.equal(typeof createWhisperLauncher({ server: 'x', model: 'y', prompt: 'JARVIS' }), 'function');
  assert.equal(typeof createWhisperLauncher({ server: 'x', model: 'y', prompt: '' }), 'function');
});
