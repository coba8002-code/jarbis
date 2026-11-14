// 로컬 화면 서버. 외부 패키지 없음. Windows·macOS 공통.
// 보안: 127.0.0.1에만 열고, Host 머리글이 이 기기 주소가 아니면 거부(DNS 리바인딩 방지),
// 모든 /api 요청은 실행마다 새로 만드는 토큰이 있어야 한다(다른 사이트의 요청 방지).
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';
import { AppError } from '../errors.js';
import { ProviderError } from '../providers/contract.js';
import { checkEcho } from '../voice/echo.js';

const PAGE = fileURLToPath(new URL('./public/index.html', import.meta.url));
const VOICE_INPUT = fileURLToPath(new URL('./public/voice-input.js', import.meta.url));
// 화면이 쓰는 정적 스크립트. 이 목록에 있는 파일만 내보낸다(경로 조작으로 다른 파일을 읽지 못하게).
const STATIC_FILES = {
  '/static/voice-input.js': VOICE_INPUT,
  '/static/avatar.js': fileURLToPath(new URL('./public/avatar.js', import.meta.url)),
};
const MAX_BODY = 1024 * 1024;

const STATUS = {
  not_found: 404,
  invalid_input: 400,
  rejected_secret: 400,
  version_mismatch: 400,
  unknown_executor: 400,
  approval_required: 409,
  invalid_state: 409,
  memory_changed: 409,
  target_changed: 409,
  payload_too_large: 413,
  storage_error: 500,
  stt_failed: 502,
  stt_unavailable: 503,
};
const MAX_AUDIO = 25 * 1024 * 1024;
const MAX_MEETING_AUDIO = 200 * 1024 * 1024; // 회의 음성 파일 최대 200MB
const MAX_MEETING_SECONDS = 2 * 60 * 60; // 회의 최대 2시간
const MAX_CHUNK = 8 * 1024 * 1024; // 회의 녹음 조각 최대 8MB

function send(res, status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...headers,
  });
  res.end(text);
}

// 본문은 JSON 객체만 받는다(null·숫자·배열·문자열은 거부).
// 너무 크면 연결을 끊지 않고 남은 본문을 버리며 다 받은 뒤 413으로 알린다.
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) return reject(new AppError('payload_too_large', '요청이 너무 큼(1MB 초과)'));
      if (!chunks.length) return resolve({});
      let value;
      try {
        value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return reject(new AppError('invalid_input', 'JSON 형식이 아님'));
      }
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return reject(new AppError('invalid_input', '본문은 JSON 객체여야 함'));
      }
      resolve(value);
    });
    req.on('error', reject);
  });
}

// 음성처럼 JSON이 아닌 본문을 그대로 읽는다. 너무 크면 남은 본문을 버리고 413.
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { tooLarge = true; chunks.length = 0; return; }
      if (!tooLarge) chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) return reject(new AppError('payload_too_large', `음성 파일이 너무 큼(${Math.round(limit / 1e6)}MB 초과)`));
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function toId(v) {
  const id = Number(v);
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError('invalid_input', `잘못된 ID: ${v}`);
  return id;
}

function sameToken(a, b) {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createAppServer(services, { token = randomBytes(24).toString('hex') } = {}) {
  const page = () => readFileSync(PAGE, 'utf8').replace('__JARVIS_TOKEN__', token);
  let allowedHosts = new Set();

  const routes = [
    ['GET', /^\/api\/info$/, () => ({
      platform: platform(),
      node: process.version,
      recovered: services.recovered,
    })],
    ['GET', /^\/api\/missions$/, (m, q) => services.missions.list({ status: q.get('status') || undefined })],
    ['GET', /^\/api\/missions\/(\d+)$/, ([, id]) => {
      const mission = services.missions.get(toId(id));
      const preview = mission.kind === 'provider.send' ? services.chat.preview(mission.id) : undefined;
      return { ...mission, preview, events: services.missions.events(mission.id) };
    }],
    ['POST', /^\/api\/missions\/(\d+)\/approve$/, ([, id], q, b) => services.missions.approve(toId(id), b.version)],
    ['POST', /^\/api\/missions\/(\d+)\/reject$/, ([, id]) => services.missions.reject(toId(id))],
    ['POST', /^\/api\/missions\/(\d+)\/cancel$/, ([, id]) => services.missions.cancel(toId(id))],
    ['POST', /^\/api\/missions\/(\d+)\/run$/, ([, id]) => services.missions.execute(toId(id))],
    ['GET', /^\/api\/quick$/, () => services.quick.list()],
    ['POST', /^\/api\/quick\/([\w-]+)$/, ([, name], q, b) => services.quick.request(name, b.params ?? {})],
    ['GET', /^\/api\/memories$/, (m, q) => (q.get('q') ? services.memory.search(q.get('q')) : services.memory.list())],
    ['POST', /^\/api\/memories$/, (m, q, b) => services.memory.add(b.content, b.tags ?? [])],
    ['PUT', /^\/api\/memories\/(\d+)$/, ([, id], q, b) => services.memory.update(toId(id), b.content, b.tags)],
    ['DELETE', /^\/api\/memories\/(\d+)$/, ([, id]) => services.memory.delete(toId(id))],
    ['GET', /^\/api\/providers$/, () => services.providers.names().map((n) => services.providers.describe(n))],
    // signal: 화면이 답을 받기 전에 연결을 끊으면(새로 고침·닫기) 생성을 끊는다(2026-11-14 실제 실행 QA).
    ['POST', /^\/api\/chat$/, (m, q, b, signal) => services.chat.ask({
      provider: b.provider,
      question: b.question,
      memoryIds: Array.isArray(b.memoryIds) ? b.memoryIds.map(toId) : [],
      model: b.model || undefined,
      speak: services.voice?.enabled === true,
      fast: services.chatSettings?.fast === true,
      autoThink: services.chatSettings?.autoThink === true,
      signal,
    })],
    ['GET', /^\/api\/chat\/settings$/, () => ({ fast: services.chatSettings.fast, autoThink: services.chatSettings.autoThink })],
    ['PUT', /^\/api\/chat\/settings$/, (m, q, b) => {
      if (b.fast !== undefined && typeof b.fast !== 'boolean') throw new AppError('invalid_input', 'fast는 true 또는 false');
      if (b.autoThink !== undefined && typeof b.autoThink !== 'boolean') throw new AppError('invalid_input', 'autoThink는 true 또는 false');
      if (b.fast === undefined && b.autoThink === undefined) throw new AppError('invalid_input', 'fast 또는 autoThink가 필요함');
      if (b.fast !== undefined) services.chatSettings.fast = b.fast;
      if (b.autoThink !== undefined) services.chatSettings.autoThink = b.autoThink;
      return { fast: services.chatSettings.fast, autoThink: services.chatSettings.autoThink };
    }],
    ['GET', /^\/api\/voice$/, () => services.voice.status()],
    ['PUT', /^\/api\/voice$/, (m, q, b) => {
      if (typeof b.enabled !== 'boolean') throw new AppError('invalid_input', 'enabled는 true 또는 false');
      services.voice.enabled = b.enabled;
      if (!b.enabled) services.voice.turns.cancel();
      return services.voice.status();
    }],
    // 멈추기: 소리로 읽는 차례와 진행 중인 글 대화를 모두 끊는다.
    ['POST', /^\/api\/voice\/stop$/, () => ({
      stopped: services.voice.turns.cancel(),
      stoppedChats: services.chat.stopAll(),
      ...services.voice.status(),
    })],
    ['GET', /^\/api\/voices$/, () => services.voice.listVoices()],
    ['GET', /^\/api\/characters$/, () => services.characters.list()],
    ['POST', /^\/api\/characters$/, (m, q, b) => services.characters.create(b)],
    ['PUT', /^\/api\/characters\/(\d+)$/, ([, id], q, b) => services.characters.update(toId(id), b)],
    ['DELETE', /^\/api\/characters\/(\d+)$/, ([, id]) => services.characters.delete(toId(id))],
    ['POST', /^\/api\/characters\/(\d+)\/activate$/, ([, id]) => services.characters.setActive(toId(id))],
    ['POST', /^\/api\/characters\/deactivate$/, () => ({ active: services.characters.setActive(null) })],
    ['POST', /^\/api\/characters\/(\d+)\/preview$/, ([, id]) => services.voice.preview(toId(id))],
    ['GET', /^\/api\/meetings$/, () => services.meetings.list()],
    // 회의록 검색(FR-008a): ?q= 제목·녹취 글. 이 기기 안에서만 찾는다.
    ['GET', /^\/api\/meetings\/search$/, (m, q) => services.meetings.search(q.get('q') ?? '')],
    ['GET', /^\/api\/meetings\/(\d+)\/segments$/, ([, id]) => services.meetings.segments(toId(id))],
    ['DELETE', /^\/api\/meetings\/(\d+)$/, ([, id]) => services.meetings.delete(toId(id))],
    // 회의 마이크 녹음(T123): 시작 · 멈춤. 조각은 아래 /chunk(본문은 WAV 그대로).
    ['POST', /^\/api\/meetings\/live$/, (m, q, b) => services.liveMeetings.start(typeof b.title === 'string' && b.title.trim() ? b.title : `회의 ${new Date().toLocaleString('ko-KR')}`)],
    ['POST', /^\/api\/meetings\/(\d+)\/stop$/, ([, id]) => services.liveMeetings.stop(toId(id))],
  ];

  const server = createServer(async (req, res) => {
    try {
      if (!allowedHosts.has(req.headers.host)) return send(res, 421, { error: { code: 'bad_host', message: '이 기기 주소로만 접속할 수 있음' } });
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return send(res, 200, page(), {
          // media-src blob: 회의 원음을 토큰으로 받아 브라우저 안에서 재생하기 위함
          'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'",
          'x-frame-options': 'DENY',
          // 마이크는 이 화면에서만(다른 사이트를 끼워 넣어 쓰지 못하게)
          'permissions-policy': 'microphone=(self), camera=(), geolocation=()',
        });
      }
      // 화면이 쓰는 정적 스크립트(자료 없음, 토큰 불필요). 정해 둔 파일만 내보낸다.
      const staticFile = req.method === 'GET' ? STATIC_FILES[url.pathname] : undefined;
      if (staticFile) {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        return res.end(readFileSync(staticFile, 'utf8'));
      }
      if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: { code: 'not_found', message: '없는 주소' } });
      if (!sameToken(req.headers['x-jarvis-token'], token)) {
        return send(res, 403, { error: { code: 'bad_token', message: '토큰이 맞지 않음' } });
      }
      // 받아쓰기: 본문은 JSON이 아니라 음성 파일 그대로(최대 25MB). 저장하지 않고 메모리로만 다룬다.
      if (url.pathname === '/api/stt') {
        if (req.method === 'GET') return send(res, 200, services.stt.status());
        if (req.method !== 'POST') return send(res, 404, { error: { code: 'not_found', message: '없는 주소' } });
        const type = String(req.headers['content-type'] ?? '').toLowerCase();
        if (!type.startsWith('audio/') && !type.startsWith('video/webm') && type !== 'application/octet-stream') {
          await readRaw(req, MAX_AUDIO).catch(() => {});
          throw new AppError('invalid_input', '음성 파일(audio/*)만 받을 수 있음');
        }
        const r = await services.stt.transcribe(await readRaw(req, MAX_AUDIO));
        // ?echo=check: 듣기 모드에서 받아 적은 글이 JARVIS가 방금 읽은 글(스피커 소리)인지 함께 알려 준다(T219).
        if (url.searchParams.get('echo') === 'check') {
          const e = checkEcho(r.text, services.voice.recentSpoken());
          return send(res, 200, { ...r, echo: e.echo, echoOverlap: e.overlap, echoReason: e.reason });
        }
        return send(res, 200, r);
      }
      // 회의 음성 파일 가져오기(US5): 이 기기 안에서 시간 구간까지 받아 적고, 원음(16kHz WAV)과 녹취를 저장한다.
      if (url.pathname === '/api/meetings/import' && req.method === 'POST') {
        const type = String(req.headers['content-type'] ?? '').toLowerCase();
        if (!type.startsWith('audio/') && !type.startsWith('video/webm') && type !== 'application/octet-stream') {
          await readRaw(req, MAX_MEETING_AUDIO).catch(() => {});
          throw new AppError('invalid_input', '음성 파일(audio/*)만 받을 수 있음');
        }
        const title = (url.searchParams.get('title') ?? '').trim() || `가져온 회의 ${new Date().toLocaleString('ko-KR')}`;
        const audio = await readRaw(req, MAX_MEETING_AUDIO);
        const r = await (services.meetingStt ?? services.stt).transcribe(audio, { segments: true, keepWav: true, maxSeconds: MAX_MEETING_SECONDS });
        const saved = services.meetings.importAudio(title, { wav: r.wav, segments: r.segments, durationMs: r.durationMs });
        return send(res, 200, { ...saved, ms: r.ms, converted: r.converted, broken: r.broken, silentDropped: r.silentDropped ?? 0 });
      }
      // 회의 마이크 녹음 조각(T123): 16kHz 모노 16비트 WAV(최대 8MB, 약 4분). 원음 뒤에 붙이고 이 기기 안에서 받아 적는다.
      const chunkMatch = url.pathname.match(/^\/api\/meetings\/(\d+)\/chunk$/);
      if (chunkMatch && req.method === 'POST') {
        const type = String(req.headers['content-type'] ?? '').toLowerCase();
        if (!type.startsWith('audio/wav') && !type.startsWith('audio/x-wav') && type !== 'application/octet-stream') {
          await readRaw(req, MAX_CHUNK).catch(() => {});
          throw new AppError('invalid_input', '회의 녹음 조각은 audio/wav만 받을 수 있음');
        }
        // ?seq=N(0 이상 정수): 조각 번호. 응답이 사라져 다시 보낸 같은 조각은 한 번만 붙인다(FR-008b). 없으면 예전처럼 붙인다.
        const seqText = url.searchParams.get('seq');
        const body = await readRaw(req, MAX_CHUNK);
        if (seqText !== null && !/^\d{1,9}$/.test(seqText)) throw new AppError('invalid_input', '조각 번호(seq)는 0 이상 정수');
        return send(res, 200, await services.liveMeetings.append(toId(chunkMatch[1]), body, seqText === null ? {} : { seq: Number(seqText) }));
      }
      // 회의 원음 재생용(토큰 필요). 화면은 받아서 브라우저 안에서만 재생한다.
      const audioMatch = url.pathname.match(/^\/api\/meetings\/(\d+)\/audio$/);
      if (audioMatch && req.method === 'GET') {
        const wav = services.meetings.readAudio(toId(audioMatch[1]));
        res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        return res.end(wav);
      }
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re);
        if (!m || method !== req.method) continue;
        const body = method === 'GET' || method === 'DELETE' ? {} : await readJson(req);
        const gone = new AbortController();
        res.on('close', () => { if (!res.writableEnded) gone.abort(); });
        return send(res, 200, await fn(m, url.searchParams, body, gone.signal));
      }
      return send(res, 404, { error: { code: 'not_found', message: '없는 주소' } });
    } catch (e) {
      if (e instanceof ProviderError) return send(res, 502, { error: { code: e.code, provider: e.provider, message: e.message } });
      if (e instanceof AppError) return send(res, STATUS[e.code] ?? 400, { error: { code: e.code, message: e.message } });
      return send(res, 500, { error: { code: 'internal', message: '내부 오류' } });
    }
  });

  return {
    server,
    token,
    // 127.0.0.1에만 연다. port 0이면 빈 포트를 고른다.
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          const p = server.address().port;
          allowedHosts = new Set([`127.0.0.1:${p}`, `localhost:${p}`]);
          resolve({ port: p, url: `http://127.0.0.1:${p}/` });
        });
      });
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
