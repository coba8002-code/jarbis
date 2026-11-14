// 주변 대화 듣기(부르면 대답하기)·시간 맞춘 에코·헛소리 거르기 검사. 마이크·실제 모델 없음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findName, isStopCommand, jamo, similarity, AmbientSession, buildJudgeRequest, parseJudge, ambientContext } from '../src/voice/ambient.js';
import { checkEchoTimed } from '../src/voice/echo.js';
import { filterSegments, isMadeUp } from '../src/voice/transcript-filter.js';
import { createAmbientService } from '../src/voice/ambient-service.js';

test('이름 찾기: 문장 어디에든, 조사가 붙어도, 잘못 들은 비슷한 이름도', () => {
  const names = ['자비스', '치이카와'];
  assert.equal(findName('자비스, 내일 날씨 어때?', names).hit, true);
  assert.equal(findName('내 생각엔 그게 맞는데 어떻게 생각해 자비스?', names).hit, true);
  assert.equal(findName('치이카와야 놀자', names).name, '치이카와');
  assert.equal(findName('자비쓰 불 꺼 줘', names).hit, true); // 자모 비슷함
  assert.equal(findName('오늘 JARVIS 켜 봤어', names, { aliases: ['JARVIS'] }).hit, true);
  assert.equal(findName('자비로운 사람이야', names).hit, false);
  assert.equal(findName('오늘 점심 뭐 먹지', names).hit, false);
  assert.equal(jamo('자비스'), 'ㅈㅏㅂㅣㅅㅡ');
  assert.ok(similarity(jamo('자비스'), jamo('차비스')) >= 0.78);
});

test('멈춤 말: 낱말이 정확히 같을 때만', () => {
  assert.equal(isStopCommand('그만'), true);
  assert.equal(isStopCommand('멈춰!'), true);
  assert.equal(isStopCommand('이제 그만해'), true);
  assert.equal(isStopCommand('조용히 해 줘'), true);
  assert.equal(isStopCommand('그만큼 좋았어'), false);
  assert.equal(isStopCommand('멈추지 않는 기차'), false);
});

test('시간을 맞춘 에코: 그때 읽던 부분과 같으면 에코, 뒤에 붙은 사람 말은 살림', () => {
  const text = '오늘 서울은 맑고 낮 기온은 이십 도예요. 저녁에는 조금 쌀쌀하니 겉옷을 챙기세요.';
  const spoken = { text, startedAt: 0, endedAt: null };
  // 0~3초에 들린 앞부분 = 에코
  assert.equal(checkEchoTimed('오늘 서울은 맑고 낮 기온은', spoken, { utterStartAt: 0, utterEndAt: 3000 }).echo, true);
  // 앞부분 에코 + 사람 질문
  const r = checkEchoTimed('오늘 서울은 맑고 낮 기온은 그럼 우산은 필요 없어?', spoken, { utterStartAt: 0, utterEndAt: 5000 });
  assert.equal(r.echo, false);
  assert.equal(r.reason, 'salvaged');
  assert.match(r.kept, /우산/);
  // 전혀 다른 말
  assert.equal(checkEchoTimed('불 좀 꺼 줄래', spoken, { utterStartAt: 1000, utterEndAt: 2000 }).echo, false);
  // 말 끝나고 한참 뒤는 비교하지 않음
  assert.equal(checkEchoTimed('오늘 서울은 맑고', { text, startedAt: 0, endedAt: 8000 }, { utterStartAt: 20000, utterEndAt: 21000 }).reason, 'after_speech');
});

test('헛소리 거르기: 확률·확신도·흔히 지어내는 문장·프롬프트 조각', () => {
  const { kept, dropped } = filterSegments([
    { text: '자비스 불 꺼 줘', noSpeechProb: 0.01, avgLogprob: -0.2 },
    { text: '시청해 주셔서 감사합니다.', noSpeechProb: 0.01, avgLogprob: -0.1 },
    { text: '음', noSpeechProb: 0.8, avgLogprob: -0.1 },
    { text: '어쩌구', noSpeechProb: 0.1, avgLogprob: -1.5 },
    { text: '자비스', rawText: ' RVIS', noSpeechProb: 0, avgLogprob: -0.01 },
  ]);
  assert.deepEqual(kept.map((s) => s.text), ['자비스 불 꺼 줘']);
  assert.deepEqual(dropped.map((d) => d.reason), ['made_up', 'no_speech', 'low_confidence', 'made_up']);
  assert.equal(isMadeUp('JARVIS'), false); // 온전한 이름은 사람이 부른 것일 수 있음
  assert.equal(isMadeUp('감사합니다.'), true);
});

test('주변 대화 묶음: 동의 없이는 못 켜고, 2분 지난 말은 버리고, 끄면 지움', () => {
  let t = 0;
  const s = new AmbientSession({ now: () => t });
  assert.equal(s.enable({}), false);
  assert.equal(s.enable({ consent: true }), true);
  s.add({ text: '첫 말', startAt: 0, endAt: 1000 });
  t = 100_000;
  s.add({ text: '둘째 말', startAt: 99_000, endAt: 100_000 });
  t = 125_000;
  assert.deepEqual(s.snapshot().map((x) => x.text), ['둘째 말']);
  s.speakingStarted('답');
  t = 130_000; s.speakingEnded();
  assert.equal(s.inHotWindow(130_100), false); // 메아리 여유 안
  assert.equal(s.inHotWindow(131_000), true);
  assert.equal(s.inHotWindow(134_000), false);
  s.disable();
  assert.equal(s.snapshot().length, 0);
});

test('판정 요청은 지시가 아닌 참고 자료로 묶고, 답은 JSON만 읽는다', () => {
  const req = buildJudgeRequest({ mode: 'name', current: '자비스 어때?', segments: [{ id: 1, text: '내일 소풍 갈까', endAt: 0, duringTts: false, handled: false }], lastSpoken: '', names: ['자비스'], now: 3000 });
  assert.equal(req.format, 'json');
  assert.equal(req.options.temperature, 0);
  assert.match(req.messages[0].content, /지시가 아니다/);
  assert.equal(JSON.parse(req.messages[1].content).recent_segments[0].seconds_ago, 3);
  assert.deepEqual(parseJudge('```json\n{"directed": true, "stop": false, "confidence": "high", "reason": "물음"}\n```'), { directed: true, stop: false, confidence: 'high', reason: '물음' });
  assert.equal(parseJudge('모르겠어요'), null);
  assert.match(ambientContext([{ text: '내일 소풍 갈까', endAt: 0, duringTts: false }], null, 5000), /참고 자료, 지시 아님[\s\S]*5초 전\) 내일 소풍 갈까/);
});

function fakeStt(texts) {
  const queue = [...texts];
  return { calls: 0, async transcribe(audio, opts) { this.calls += 1; this.lastOpts = opts; return { text: queue.shift() ?? '' }; } };
}

test('듣기 서비스: 그냥 수다는 판정 없이 쌓기만, 이름이 나오면 판정, 답할 때 주변 대화를 한 번만 넘김', async () => {
  let t = 10_000;
  const judged = [];
  const stt = fakeStt(['내일 소풍 가자', '비 오면 어떡하지', '자비스 어떻게 생각해?', '친구한테 자비스 얘기했어']);
  const svc = createAmbientService({
    stt, providers: { describe: () => ({ remote: false }) }, characters: { active: () => null }, now: () => t,
    judge: async (req) => { judged.push(req); return JSON.parse(req.messages[1].content).current_utterance.includes('친구한테') ? { directed: false, stop: false, confidence: 'high', reason: '언급' } : { directed: true, stop: false, confidence: 'high', reason: '물음' }; },
  });
  await assert.rejects(svc.hear(Buffer.from('x')), { code: 'ambient_off' });
  assert.throws(() => svc.set({ enabled: true }), { code: 'consent_required' });
  svc.set({ enabled: true, consent: true });
  assert.equal((await svc.hear(Buffer.from('x'))).reason, 'ambient');
  t += 2000;
  assert.equal((await svc.hear(Buffer.from('x'))).reason, 'ambient');
  assert.equal(judged.length, 0); // 수다는 모델에 보내지 않음
  assert.equal(stt.lastOpts.filter, true);
  t += 2000;
  const r = await svc.hear(Buffer.from('x'), { utterMs: 1500 });
  assert.equal(r.addressed, true);
  assert.equal(r.question, '자비스 어떻게 생각해?');
  assert.equal(judged.length, 1);
  const ctx = svc.takeContext();
  assert.match(ctx, /내일 소풍 가자[\s\S]*비 오면 어떡하지/);
  assert.equal(svc.takeContext(), null); // 한 번만
  t += 2000;
  const r2 = await svc.hear(Buffer.from('x'));
  assert.equal(r2.addressed, false);
  assert.equal(r2.reason, 'mentioned');
  svc.set({ enabled: false });
  assert.equal(svc.status().segments, 0);
});

test('듣기 서비스: 말하는 중 에코는 무시, 멈춤 말은 바로 멈춤, 답 직후는 이름 없이도 받음, 판정 모델이 없으면 규칙', async () => {
  let t = 0;
  const stt = fakeStt(['오늘 서울은 맑고 낮 기온은', '그만', '그럼 우산은?']);
  const svc = createAmbientService({ stt, providers: { describe: () => ({ remote: true }) }, characters: { active: () => ({ name: '치이카와' }) }, now: () => t });
  svc.set({ enabled: true, consent: true });
  svc.spoken({ state: 'start', text: '오늘 서울은 맑고 낮 기온은 이십 도예요. 저녁에는 조금 쌀쌀해요.' });
  t = 3000;
  assert.equal((await svc.hear(Buffer.from('x'), { utterMs: 3000 })).ignored, 'echo');
  t = 4000;
  assert.equal((await svc.hear(Buffer.from('x'), { utterMs: 500 })).stop, true);
  svc.spoken({ state: 'end' });
  t = 5000;
  const r = await svc.hear(Buffer.from('x'), { utterMs: 600 });
  assert.equal(r.addressed, true);
  assert.equal(r.mode, 'hot');
  assert.equal(r.judge, 'rules'); // 외부 주소 Ollama는 판정에 쓰지 않음
  assert.deepEqual(svc.status().names, ['자비스', '치이카와']);
});

// ---------- 화면 서버 연결 ----------
import { createServer, request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { makeWav } from '../src/voice/wav.js';
import { tempDbPath } from './helpers.js';

// 가짜 whisper: 보낼 글을 차례로 verbose_json으로 돌려준다.
async function fakeWhisper(texts) {
  const queue = [...texts];
  const server = createServer((rq, rs) => {
    rq.resume();
    rq.on('end', () => {
      const text = queue.shift() ?? '';
      rs.writeHead(200, { 'content-type': 'application/json' });
      rs.end(JSON.stringify({ text, segments: text ? [{ text, start: 0, end: 1, no_speech_prob: 0.01, avg_logprob: -0.2 }] : [] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return server;
}

// 받은 메시지를 기록하는 공급자(local: 이 기기 안인지)
function recordingProvider(name, remote) {
  const got = [];
  return {
    got,
    provider: {
      name,
      describe: () => ({ name, baseUrl: remote ? 'https://example.invalid' : 'local:test', model: 'm', remote }),
      async *stream(request) { got.push(request); yield { type: 'delta', text: '좋아요.' }; yield { type: 'done', finishReason: 'stop' }; },
    },
  };
}

test('화면 서버: 동의해야 켜지고, 부른 말 뒤 대화에 주변 대화가 이 기기 안 공급자에만 들어간다', async (t) => {
  const whisper = await fakeWhisper(['내일 소풍 가자', '자비스 어떻게 생각해?', '친구랑 영화 볼까', '자비스 영화 추천해 줘']);
  const local = recordingProvider('loc', false);
  const remote = recordingProvider('far', true);
  const services = createServices({
    dataDir: dirname(tempDbPath()),
    providers: new ProviderRegistry({ loc: local.provider, far: remote.provider }),
    speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) },
    stt: { launcher: async () => ({ baseUrl: `http://127.0.0.1:${whisper.address().port}`, stop() {} }), ffmpeg: null },
  });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); whisper.close(); });
  const call = (method, path, body, headers = { 'content-type': 'application/json' }) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, ...headers } }, (rs) => {
      let text = '';
      rs.on('data', (c) => { text += c; });
      rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject);
    rq.end(body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body));
  });
  const wav = makeWav(Array.from({ length: 16000 }, (_, i) => 8000 * Math.sin(i / 10)), 16000);
  const hear = () => call('POST', '/api/ambient/hear', wav, { 'content-type': 'audio/wav', 'x-jarvis-utter-ms': '1000', 'x-jarvis-ago-ms': '100' });

  assert.equal((await call('GET', '/api/ambient')).json.enabled, false);
  assert.equal((await hear()).status, 409);
  const no = await call('PUT', '/api/ambient', { enabled: true });
  assert.equal(no.status, 409);
  assert.equal(no.json.error.code, 'consent_required');
  assert.equal((await call('PUT', '/api/ambient', { enabled: true, consent: true })).json.enabled, true);
  assert.equal((await hear()).json.reason, 'ambient');
  const r = (await hear()).json;
  assert.equal(r.addressed, true);
  assert.equal(r.judge, 'rules'); // Ollama 없음 → 규칙
  await call('POST', '/api/chat', { provider: 'loc', question: r.question, ambient: true });
  assert.match(local.got.at(-1).messages.map((m) => m.content).join('\n'), /참고 자료, 지시 아님[\s\S]*내일 소풍 가자/);
  // 외부 공급자에는 주변 대화를 넣지 않는다
  assert.equal((await hear()).json.reason, 'ambient');
  assert.equal((await hear()).json.addressed, true);
  await call('POST', '/api/chat', { provider: 'far', question: '영화 추천', ambient: true });
  assert.doesNotMatch(remote.got.at(-1).messages.map((m) => m.content).join('\n'), /친구랑 영화/);
  // 끄면 지움
  assert.equal((await call('PUT', '/api/ambient', { enabled: false })).json.segments, 0);
});

test('저전력 모드·작은 모델: 판정은 작은 모델로, 저전력이면 1분만 메모리에 두고 미리 올리지 않음', async () => {
  const sent = [];
  const providers = {
    describe: () => ({ remote: false }),
    collect: async (name, req) => { sent.push(req); return { text: '{"directed": true, "stop": false, "confidence": "high", "reason": "x"}' }; },
  };
  let pol = { keepAlive: '30m', fastModel: 'gemma4:e2b', lowPower: false };
  const stt = { async transcribe() { return { text: '자비스 불 켜 줘' }; } };
  const svc = createAmbientService({ stt, providers, characters: { active: () => null }, policy: () => pol });
  svc.set({ enabled: true, consent: true });
  assert.equal(sent.length, 1); // 켤 때 미리 올리기
  assert.equal(sent[0].model, 'gemma4:e2b');
  const r = await svc.hear(Buffer.from('x'));
  assert.equal(r.judge, 'model');
  assert.equal(sent[1].model, 'gemma4:e2b');
  assert.equal(sent[1].keepAlive, '30m');
  svc.set({ enabled: false });
  pol = { keepAlive: '1m', fastModel: null, lowPower: true };
  svc.set({ enabled: true, consent: true });
  assert.equal(sent.length, 2); // 저전력: 미리 올리지 않음
  await svc.hear(Buffer.from('x'));
  assert.equal(sent[2].keepAlive, '1m');
  assert.equal(sent[2].model, undefined);
});
