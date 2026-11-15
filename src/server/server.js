// 로컬 화면 서버. 외부 패키지 없음. Windows·macOS 공통.
// 보안: 127.0.0.1에만 열고, Host 머리글이 이 기기 주소가 아니면 거부(DNS 리바인딩 방지),
// 모든 /api 요청은 실행마다 새로 만드는 토큰이 있어야 한다(다른 사이트의 요청 방지).
import { logAudioDiag } from './audio-diag.js';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';
import { AppError } from '../errors.js';
import { ProviderError } from '../providers/contract.js';
import { checkEcho } from '../voice/echo.js';
import { MAX_IMAGE_BYTES, IMAGE_STATES } from '../character/avatar-images.js';
import { listPresets, adoptPreset, applyMascot, CHARACTER_PRESETS } from '../character/presets.js';

const PAGE = fileURLToPath(new URL('./public/index.html', import.meta.url));
// 자비스 모드: 캐릭터 얼굴과 대화만 크게 보이는 화면(토스 기기·휴대폰용) + 장치 점검. 설정은 PAGE(설정 모드)에서.
const JARVIS_PAGE = fileURLToPath(new URL('./public/jarvis.html', import.meta.url));
const VOICE_INPUT = fileURLToPath(new URL('./public/voice-input.js', import.meta.url));
// 화면이 쓰는 정적 스크립트. 이 목록에 있는 파일만 내보낸다(경로 조작으로 다른 파일을 읽지 못하게).
const STATIC_FILES = {
  '/static/voice-input.js': VOICE_INPUT,
  '/static/avatar.js': fileURLToPath(new URL('./public/avatar.js', import.meta.url)),
  '/static/presence.js': fileURLToPath(new URL('./public/presence.js', import.meta.url)),
  '/static/faces.js': fileURLToPath(new URL('./public/faces.js', import.meta.url)),
  // 단축키 판·일정 바로 보기(메인 화면) · 설정 화면의 단축키·구글 탭 · 함께 쓰는 아이콘
  '/static/deck.js': fileURLToPath(new URL('./public/deck.js', import.meta.url)),
  '/static/deck-settings.js': fileURLToPath(new URL('./public/deck-settings.js', import.meta.url)),
  '/static/deck-icons.js': fileURLToPath(new URL('./public/deck-icons.js', import.meta.url)),
  // 캐릭터 모션(docs/CHARACTER_MOTION.md)
  '/static/motion.js': fileURLToPath(new URL('./public/motion.js', import.meta.url)),
  // 메인 화면 회의 녹음(캐릭터 아래 회의 버튼)
  '/static/meeting-rec.js': fileURLToPath(new URL('./public/meeting-rec.js', import.meta.url)),
  // 대기화면 보드(조는 캐릭터·날씨·오늘 중요한 일·해야 할 일)
  '/static/idle-board.js': fileURLToPath(new URL('./public/idle-board.js', import.meta.url)),
};
// 얼굴 알아보기(2026-11-14 사용자 승인으로 내려받음): face-api 1.7.15(MIT, jsdelivr 해시 확인). 화면 브라우저 안에서만 쓴다.
// 이름에 판(버전)이 들어 있어 바뀌지 않으므로 기기에 일주일 저장해 매번 6MB를 다시 받지 않게 한다.
const FACE_API_DIR = 'vendor/face-api-1.7.15';
for (const f of ['face-api.esm.js', 'model/tiny_face_detector_model-weights_manifest.json', 'model/tiny_face_detector_model.bin',
  'model/face_landmark_68_tiny_model-weights_manifest.json', 'model/face_landmark_68_tiny_model.bin',
  'model/face_recognition_model-weights_manifest.json', 'model/face_recognition_model.bin']) {
  STATIC_FILES[`/static/${FACE_API_DIR}/${f}`] = fileURLToPath(new URL(`./public/${FACE_API_DIR}/${f}`, import.meta.url));
}
// 오리지널 캐릭터 자비 그림(친구 고르기 미리 보기용, 바뀌지 않는 파일)
for (const p of CHARACTER_PRESETS.filter((x) => x.mascot)) {
  for (const s of IMAGE_STATES) STATIC_FILES[`/static/mascot/${p.key}/${s}.png`] = fileURLToPath(new URL(`../character/mascot/${p.key}/${s}.png`, import.meta.url));
}
const STATIC_TYPES = { '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.bin': 'application/octet-stream', '.png': 'image/png' };
const MAX_BODY = 1024 * 1024;

const STATUS = {
  not_found: 404,
  invalid_input: 400,
  rejected_secret: 400,
  version_mismatch: 400,
  unknown_executor: 400,
  approval_required: 409,
  consent_required: 409,
  not_configured: 503,
  briefing_failed: 502,
  skill_failed: 502,
  ambient_off: 409,
  invalid_state: 409,
  memory_changed: 409,
  target_changed: 409,
  payload_too_large: 413,
  storage_error: 500,
  stt_failed: 502,
  stt_unavailable: 503,
  tts_unavailable: 503,
  tts_failed: 502,
  google_not_connected: 409,
  google_denied: 409,
  google_failed: 502,
  shortcut_failed: 502,
  pc_local_only: 403,
  summary_failed: 502,
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

// 이 PC에서 연 화면인지(주소가 127.0.0.1·localhost). USB(adb reverse)로 붙은 기기도 여기에 든다(선으로 묶인 기기).
// 와이파이·Tailscale 주소로 연 화면은 아니다. PC 조작 버튼 만들기·구글 연결은 이 PC 화면에서만 한다.
const isLocalHost = (req) => /^(127\.0\.0\.1|localhost):\d+$/.test(String(req.headers.host ?? ''));
const needConfirm = (b) => { if (b.confirm !== true) throw new AppError('invalid_input', '구글에 쓰기 전에 화면에서 확인해야 해요(confirm: true)'); };

function sameToken(a, b) {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// tls: { key, cert }를 주면 보안 연결(HTTPS)로 연다(src/app/tls.js). 없으면 지금처럼 HTTP.
export function createAppServer(services, { token = randomBytes(24).toString('hex'), tls } = {}) {
  const page = (file = PAGE) => readFileSync(file, 'utf8').replace('__JARVIS_TOKEN__', token);
  let allowedHosts = new Set();

  const routes = [
    // PC 점검(doctor.js): 서버·Ollama·받아쓰기·ffmpeg. 점검 함수가 없으면(검사 환경) 서버만 정상으로 알린다.
    ['GET', /^\/api\/health$/, async () => (services.doctor ? services.doctor() : { summary: { ok: 1, warn: 0, fail: 0 }, checks: [{ id: 'server', name: '화면 서버', state: 'ok', detail: '응답함' }] })],
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
    // 위험 낮음 한꺼번에 승인: { items: [{ id, version }] }
    ['POST', /^\/api\/missions\/approve-low$/, (m, q, b) => services.missions.approveLow(b.items)],
    ['POST', /^\/api\/missions\/(\d+)\/reject$/, ([, id]) => services.missions.reject(toId(id))],
    ['POST', /^\/api\/missions\/(\d+)\/cancel$/, ([, id]) => services.missions.cancel(toId(id))],
    ['POST', /^\/api\/missions\/(\d+)\/run$/, ([, id]) => services.missions.execute(toId(id))],
    ['GET', /^\/api\/quick$/, () => services.quick.list()],
    ['POST', /^\/api\/quick\/([\w-]+)$/, ([, name], q, b) => services.quick.request(name, b.params ?? {})],
    ['GET', /^\/api\/memories$/, (m, q) => (q.get('q') ? services.memory.search(q.get('q')) : services.memory.list())],
    ['POST', /^\/api\/memories$/, (m, q, b) => services.memory.add(b.content, b.tags ?? [])],
    ['PUT', /^\/api\/memories\/(\d+)$/, ([, id], q, b) => services.memory.update(toId(id), b.content, b.tags)],
    ['DELETE', /^\/api\/memories\/(\d+)$/, ([, id]) => services.memory.delete(toId(id))],
    // 기억 제안: 목록 · 고르기(내용을 고쳐 넣을 수 있음) · 버리기. 고른 것만 기억에 저장된다.
    ['GET', /^\/api\/memory-suggestions$/, () => services.memorySuggest.list()],
    ['POST', /^\/api\/memory-suggestions\/(\d+)\/accept$/, ([, id], q, b) => services.memorySuggest.accept(toId(id), b.content)],
    ['DELETE', /^\/api\/memory-suggestions\/(\d+)$/, ([, id]) => services.memorySuggest.dismiss(toId(id))],
    ['GET', /^\/api\/providers$/, () => services.providers.names().map((n) => services.providers.describe(n))],
    // 메인 화면 AI 고르기: Ollama에 받아 둔 모델(라마 등) 목록. 이 기기 안 Ollama만 묻는다.
    ['GET', /^\/api\/providers\/ollama\/models$/, async () => (await services.providers.providers.ollama?.models?.()) ?? []],
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
      // ambient: 부르면 대답하기로 온 질문이면 방금 들린 대화를 참고 자료로 넣는다(이 기기 안 공급자만).
      context: b.ambient === true ? services.ambient?.takeContext() ?? null : null,
    })],
    // 주변 대화 듣기(부르면 대답하기): 상태 · 켜기/끄기(켜려면 consent: true) · 기기가 말하기 시작/끝 · 진행 중 판단 버리기
    ['GET', /^\/api\/ambient$/, () => services.ambient.status()],
    ['PUT', /^\/api\/ambient$/, (m, q, b) => services.ambient.set({ enabled: b.enabled, consent: b.consent })],
    ['POST', /^\/api\/ambient\/spoken$/, (m, q, b) => services.ambient.spoken({ state: b.state, text: typeof b.text === 'string' ? b.text.slice(0, 4000) : '' })],
    ['POST', /^\/api\/ambient\/bump$/, () => services.ambient.bump()],
    // k-skill 조회 스킬: 목록 · 켜기(동의 필요)/끄기 · 기본 위치(날씨 등)
    ['GET', /^\/api\/skills$/, () => ({ skills: services.kskills.list(), home: services.kskills.home(), source: 'NomaDamas/k-skill (MIT)' })],
    ['PUT', /^\/api\/skills\/home$/, (m, q, b) => ({ home: services.kskills.setHome(b.home ?? null) })],
    ['PUT', /^\/api\/skills\/([a-z0-9-]+)$/, ([, name], q, b) => services.kskills.set(name, { enabled: b.enabled, consent: b.consent })],
    // 아침 브리핑: 오늘 것·설정 보기 · 지금 만들기 · 켜기/시각 바꾸기
    ['GET', /^\/api\/briefing$/, () => services.briefings.status()],
    ['POST', /^\/api\/briefing\/generate$/, (m, q, b, signal) => services.briefings.generate({ signal })],
    ['PUT', /^\/api\/briefing\/settings$/, (m, q, b) => services.briefings.setSettings({ enabled: b.enabled, time: b.time })],
    ['GET', /^\/api\/chat\/settings$/, () => ({ fast: services.chatSettings.fast, autoThink: services.chatSettings.autoThink, lowPower: services.chatSettings.lowPower === true })],
    ['PUT', /^\/api\/chat\/settings$/, (m, q, b) => {
      if (b.fast !== undefined && typeof b.fast !== 'boolean') throw new AppError('invalid_input', 'fast는 true 또는 false');
      if (b.autoThink !== undefined && typeof b.autoThink !== 'boolean') throw new AppError('invalid_input', 'autoThink는 true 또는 false');
      if (b.lowPower !== undefined && typeof b.lowPower !== 'boolean') throw new AppError('invalid_input', 'lowPower는 true 또는 false');
      if (b.fast === undefined && b.autoThink === undefined && b.lowPower === undefined) throw new AppError('invalid_input', 'fast·autoThink·lowPower 중 하나가 필요함');
      if (b.fast !== undefined) services.chatSettings.fast = b.fast;
      if (b.autoThink !== undefined) services.chatSettings.autoThink = b.autoThink;
      if (b.lowPower !== undefined) services.chatSettings.lowPower = b.lowPower;
      return { fast: services.chatSettings.fast, autoThink: services.chatSettings.autoThink, lowPower: services.chatSettings.lowPower === true };
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
    ['GET', /^\/api\/characters$/, () => services.characters.list().map((c) => ({ ...c, images: services.avatarImages.list(c.id) }))],
    ['POST', /^\/api\/characters$/, (m, q, b) => services.characters.create(b)],
    ['PUT', /^\/api\/characters\/(\d+)$/, ([, id], q, b) => services.characters.update(toId(id), b)],
    // 캐릭터를 지우면 그 그림 얼굴 폴더도 지운다
    ['DELETE', /^\/api\/characters\/(\d+)$/, ([, id]) => { const r = services.characters.delete(toId(id)); services.avatarImages.removeAll(toId(id)); return r; }],
    ['POST', /^\/api\/characters\/(\d+)\/activate$/, ([, id]) => services.characters.setActive(toId(id))],
    ['POST', /^\/api\/characters\/deactivate$/, () => ({ active: services.characters.setActive(null) })],
    ['POST', /^\/api\/characters\/(\d+)\/preview$/, ([, id]) => services.voice.preview(toId(id))],
    // 고를 수 있는 캐릭터(치이카와·산리오): 목록 · 고르기(같은 이름이 있으면 그 캐릭터를 적용, 없으면 만들어 적용)
    ['GET', /^\/api\/character-presets$/, () => listPresets(services.characters)],
    ['POST', /^\/api\/character-presets\/([a-z0-9-]+)\/adopt$/, ([, key]) => {
      const r = adoptPreset(services.characters, key);
      // 오리지널 친구(자비·동물 친구)는 그림 얼굴을 함께 넣는다(사용자가 바꾼 그림은 그대로 둠, 빠진 상태만 채움)
      const added = r.mascot ? applyMascot(services.avatarImages, r.character.id, IMAGE_STATES, r.key) : 0;
      return { ...r, imagesAdded: added, images: services.avatarImages.list(r.character.id) };
    }],
    // 구글 캘린더·Tasks: 상태 · 연결 시작(이 PC 화면에서만) · 그만두기 · 끊기 · 일정/할 일 보기 · 추가 · 완료(쓰기는 confirm: true 필요)
    ['GET', /^\/api\/google$/, () => services.google.status()],
    ['POST', /^\/api\/google\/connect$/, (m, q, b, s, req) => {
      if (!isLocalHost(req)) throw new AppError('pc_local_only', '구글 연결은 JARVIS를 켠 PC 화면에서 해 주세요');
      return services.google.connect();
    }],
    ['POST', /^\/api\/google\/cancel$/, () => ({ cancelled: services.google.cancelConnect(), ...services.google.status() })],
    ['DELETE', /^\/api\/google$/, () => services.google.disconnect()],
    ['GET', /^\/api\/google\/events$/, (m, q) => services.google.events({ days: q.get('days') ? Number(q.get('days')) : 7 })],
    ['POST', /^\/api\/google\/events$/, (m, q, b) => { needConfirm(b); return services.google.addEvent({ title: b.title, date: b.date, start: b.start || undefined, end: b.end || undefined }); }],
    ['GET', /^\/api\/google\/tasks$/, () => services.google.tasks()],
    ['POST', /^\/api\/google\/tasks$/, (m, q, b) => { needConfirm(b); return services.google.addTask({ title: b.title, due: b.due || undefined }); }],
    ['POST', /^\/api\/google\/tasks\/([A-Za-z0-9_-]{1,200})\/complete$/, ([, id], q, b) => { needConfirm(b); return services.google.completeTask(id); }],
    // 대기화면(쉬는 화면): 날씨·오늘 중요한 일·해야 할 일 한 번에 · 할 일 가져오는 곳 설정
    ['GET', /^\/api\/board$/, () => services.board.view()],
    ['GET', /^\/api\/board\/settings$/, () => services.board.settingsView()],
    ['PUT', /^\/api\/board\/settings$/, (m, q, b) => services.board.setTodoSource(b.todoSource)],
    // 단축키 판: 목록 · 통째로 저장(PC 조작 버튼은 이 PC 화면에서만 새로 만들거나 바꿈) · 기본으로 되돌리기 · 누르기
    ['GET', /^\/api\/shortcuts$/, (m, q, b, s, req) => ({ ...services.shortcuts.list(), local: isLocalHost(req) })],
    ['PUT', /^\/api\/shortcuts$/, (m, q, b, s, req) => ({ ...services.shortcuts.save(b.buttons, { local: isLocalHost(req) }), local: isLocalHost(req) })],
    ['POST', /^\/api\/shortcuts\/reset$/, (m, q, b, s, req) => ({ ...services.shortcuts.reset(), local: isLocalHost(req) })],
    ['POST', /^\/api\/shortcuts\/([a-z0-9-]{1,24})\/press$/, ([, id]) => services.shortcuts.press(id)],
    ['GET', /^\/api\/meetings$/, () => services.meetings.list()],
    // 회의록 검색(FR-008a): ?q= 제목·녹취 글. 이 기기 안에서만 찾는다.
    ['GET', /^\/api\/meetings\/search$/, (m, q) => services.meetings.search(q.get('q') ?? '')],
    ['GET', /^\/api\/meetings\/(\d+)\/segments$/, ([, id]) => services.meetings.segments(toId(id))],
    ['DELETE', /^\/api\/meetings\/(\d+)$/, ([, id]) => services.meetings.delete(toId(id))],
    // 회의 의견·결론 정리(이 기기 안 모델만): 보기(없으면 summary: null) · 만들기(같은 회의 동시 요청은 하나로, 화면이 끊으면 멈춤)
    ['GET', /^\/api\/meetings\/(\d+)\/summary$/, ([, id]) => services.meetingSummaries.status(toId(id))],
    ['POST', /^\/api\/meetings\/(\d+)\/summary$/, ([, id], q, b, signal) => services.meetingSummaries.generate(toId(id), { signal }).then((summary) => ({ summary, generating: false }))],
    // 회의 마이크 녹음(T123): 시작 · 멈춤. 조각은 아래 /chunk(본문은 WAV 그대로).
    ['POST', /^\/api\/meetings\/live$/, (m, q, b) => services.liveMeetings.start(typeof b.title === 'string' && b.title.trim() ? b.title : `회의 ${new Date().toLocaleString('ko-KR')}`)],
    ['POST', /^\/api\/meetings\/(\d+)\/stop$/, ([, id]) => services.liveMeetings.stop(toId(id))],
  ];

  const handler = async (req, res) => {
    try {
      if (!allowedHosts.has(req.headers.host)) return send(res, 421, { error: { code: 'bad_host', message: '이 기기 주소로만 접속할 수 있음' } });
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return send(res, 200, page(), {
          // media-src blob: 회의 원음을 토큰으로 받아 브라우저 안에서 재생하기 위함
          'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; img-src 'self' blob:; frame-ancestors 'none'",
          'x-frame-options': 'DENY',
          // 마이크는 이 화면에서만(다른 사이트를 끼워 넣어 쓰지 못하게)
          'permissions-policy': 'microphone=(self), camera=(), geolocation=()',
        });
      }
      if (req.method === 'GET' && (url.pathname === '/jarvis' || url.pathname === '/jarvis.html')) {
        return send(res, 200, page(JARVIS_PAGE), {
          'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; img-src 'self' blob:; frame-ancestors 'none'",
          'x-frame-options': 'DENY',
          // 장치 점검에서 카메라 미리 보기를 시험할 수 있게 이 화면만 카메라를 허용(저장·전송 없음)
          'permissions-policy': 'microphone=(self), camera=(self), geolocation=()',
        });
      }
      // 화면이 쓰는 정적 스크립트(자료 없음, 토큰 불필요). 정해 둔 파일만 내보낸다.
      const staticFile = req.method === 'GET' ? STATIC_FILES[url.pathname] : undefined;
      if (staticFile) {
        const ext = staticFile.slice(staticFile.lastIndexOf('.'));
        const cache = url.pathname.startsWith(`/static/${FACE_API_DIR}/`) || url.pathname.startsWith('/static/mascot/') ? 'public, max-age=604800' : 'no-store';
        res.writeHead(200, { 'content-type': STATIC_TYPES[ext] ?? 'application/octet-stream', 'cache-control': cache, 'x-content-type-options': 'nosniff' });
        return res.end(readFileSync(staticFile));
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
        // filter: 조용할 때 지어낸 말("시청해 주셔서 감사합니다." 등)을 뺀다(transcript-filter.js).
        const sttAudio = await readRaw(req, MAX_AUDIO);
        logAudioDiag('/api/stt', sttAudio); // JARVIS_AUDIO_DIAG=1 일 때만 소리 크기 한 줄
        const r = await services.stt.transcribe(sttAudio, { filter: true });
        // ?echo=check: 듣기 모드에서 받아 적은 글이 JARVIS가 방금 읽은 글(스피커 소리)인지 함께 알려 준다(T219).
        if (url.searchParams.get('echo') === 'check') {
          const e = checkEcho(r.text, services.voice.recentSpoken());
          return send(res, 200, { ...r, echo: e.echo, echoOverlap: e.overlap, echoReason: e.reason });
        }
        return send(res, 200, r);
      }
      // 주변 대화 듣기: 들린 말 한 마디(본문은 WAV 그대로). 받아 적은 글은 PC 메모리에만 잠깐 둔다.
      // 머리글 x-jarvis-utter-ms: 말 길이, x-jarvis-ago-ms: 말이 끝나고 보내기까지 걸린 시간.
      if (url.pathname === '/api/ambient/hear' && req.method === 'POST') {
        const type = String(req.headers['content-type'] ?? '').toLowerCase();
        if (!type.startsWith('audio/') && type !== 'application/octet-stream') {
          await readRaw(req, MAX_AUDIO).catch(() => {});
          throw new AppError('invalid_input', '음성 파일(audio/*)만 받을 수 있음');
        }
        const audio = await readRaw(req, MAX_AUDIO);
        logAudioDiag('/api/ambient/hear', audio);
        return send(res, 200, await services.ambient.hear(audio, {
          utterMs: Math.min(60_000, Number(req.headers['x-jarvis-utter-ms']) || 0),
          agoMs: Math.min(60_000, Number(req.headers['x-jarvis-ago-ms']) || 0),
        }));
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
      // 캐릭터 그림 얼굴(?state=idle·listening·thinking·speaking·speaking2). 본문은 그림 파일 그대로(최대 5MB).
      // 받기·올리기·지우기 모두 토큰이 필요하다. 화면은 받아서 브라우저 안에서만(blob) 보여 준다.
      const imageMatch = url.pathname.match(/^\/api\/characters\/(\d+)\/image$/);
      if (imageMatch) {
        const id = toId(imageMatch[1]);
        const state = url.searchParams.get('state') ?? '';
        if (req.method === 'POST') {
          services.characters.get(id);
          const type = String(req.headers['content-type'] ?? '').toLowerCase();
          if (!type.startsWith('image/') && type !== 'application/octet-stream') {
            await readRaw(req, MAX_IMAGE_BYTES).catch(() => {});
            throw new AppError('invalid_input', '그림 파일(image/*)만 받을 수 있음');
          }
          return send(res, 200, services.avatarImages.save(id, state, await readRaw(req, MAX_IMAGE_BYTES)));
        }
        if (req.method === 'GET') {
          const img = services.avatarImages.read(id, state);
          res.writeHead(200, { 'content-type': img.type, 'content-length': img.buf.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
          return res.end(img.buf);
        }
        if (req.method === 'DELETE') return send(res, 200, services.avatarImages.remove(id, state));
        return send(res, 404, { error: { code: 'not_found', message: '없는 주소' } });
      }
      // PC 음성 대체(토큰 필요): 기기(토스 기기 등)에 음성 엔진이 없을 때 { text }를 PC 음성으로 WAV로 만들어 준다.
      // 화면은 받아서 그 기기 스피커로만 재생한다. 글은 최대 2000자, 저장하지 않는다.
      if (url.pathname === '/api/tts' && req.method === 'POST') {
        const b = await readJson(req);
        if (typeof b.text !== 'string' || !b.text.trim()) throw new AppError('invalid_input', 'text(읽을 글)가 필요함');
        if (b.text.length > 2000) throw new AppError('invalid_input', 'text는 2000자까지');
        if (typeof services.voice?.synthesizeWav !== 'function') throw new AppError('tts_unavailable', '음성 합성이 준비되지 않음');
        const wav = await services.voice.synthesizeWav(b.text.trim());
        res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        return res.end(wav);
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
        return send(res, 200, await fn(m, url.searchParams, body, gone.signal, req));
      }
      return send(res, 404, { error: { code: 'not_found', message: '없는 주소' } });
    } catch (e) {
      if (e instanceof ProviderError) return send(res, 502, { error: { code: e.code, provider: e.provider, message: e.message } });
      if (e instanceof AppError) return send(res, STATUS[e.code] ?? 400, { error: { code: e.code, message: e.message } });
      return send(res, 500, { error: { code: 'internal', message: '내부 오류' } });
    }
  };
  const server = tls ? createHttpsServer({ key: tls.key, cert: tls.cert }, handler) : createServer(handler);
  const scheme = tls ? 'https' : 'http';

  return {
    server,
    token,
    // 기본은 127.0.0.1에만 연다(이 기기 전용). port 0이면 빈 포트를 고른다.
    // host를 주면 그 주소로도 열어, 같은 와이파이의 다른 기기(예: 태블릿)에서 접속할 수 있다.
    // 화면을 열면 토큰도 함께 받으므로, 같은 망에서 주소를 아는 누구나 쓸 수 있다. 집처럼 믿는 망에서만 쓴다.
    listen(port = 0, { host } = {}) {
      const bind = host ? '0.0.0.0' : '127.0.0.1';
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, bind, () => {
          const p = server.address().port;
          allowedHosts = new Set([`127.0.0.1:${p}`, `localhost:${p}`]);
          if (host) allowedHosts.add(`${host}:${p}`);
          resolve({ port: p, url: `${scheme}://${host ?? '127.0.0.1'}:${p}/`, lan: Boolean(host), secure: Boolean(tls) });
        });
      });
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
