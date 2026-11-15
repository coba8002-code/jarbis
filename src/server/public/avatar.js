// 캐릭터 얼굴(T155 잠정안, FR-003a). 원본 그림이 없어 단순한 오리지널 도형 얼굴을 코드로 그린다.
// 외부 그림 자산·기존 캐릭터 모사는 쓰지 않는다. 화면(브라우저)과 Node 검사에서 같이 쓴다(외부 의존 없음).
// - 모양(shape)·색(color)·눈(eyes) 세 가지만 고른다.
// - 상태: idle(대기)·listening(듣기)·thinking(생각)·speaking(말하기).
// - 말하는 동안 입: 소리 크기를 알 수 있으면 크기에 맞춰(립싱크), 단어 알림만 있으면 단어 박자로,
//   둘 다 없으면 말소리 같은 박자로 열고 닫는다(아래 "립싱크·눈 깜빡임"). 음소(입술 모양) 분석은 하지 않는다.

export const SHAPES = ['circle', 'rounded', 'drop'];
export const EYES = ['round', 'line', 'dot'];
export const STATES = ['idle', 'listening', 'thinking', 'speaking'];
export const DEFAULT_LOOK = Object.freeze({ shape: 'circle', color: '#2563eb', eyes: 'round' });
const COLOR = /^#[0-9a-fA-F]{6}$/;

// 저장된 값이 잘못돼도 그리기는 기본값으로 안전하게(색 칸에 글이 섞여 SVG에 들어가지 않게).
export function normalizeLook(look) {
  const l = look && typeof look === 'object' ? look : {};
  return {
    shape: SHAPES.includes(l.shape) ? l.shape : DEFAULT_LOOK.shape,
    color: typeof l.color === 'string' && COLOR.test(l.color) ? l.color.toLowerCase() : DEFAULT_LOOK.color,
    eyes: EYES.includes(l.eyes) ? l.eyes : DEFAULT_LOOK.eyes,
  };
}

// 화면 상태 → 얼굴 상태. 녹음 중이면 듣기, 서버가 말하는 중이면 말하기, 답을 기다리면 생각.
export function avatarState({ voiceState = 'idle', recording = false, chatPending = false } = {}) {
  if (recording) return 'listening';
  if (voiceState === 'speaking') return 'speaking';
  if (voiceState === 'thinking' || chatPending) return 'thinking';
  if (voiceState === 'listening') return 'listening';
  return 'idle';
}

// 입이 열렸는지: 말하기일 때만 intervalMs 박자로 번갈아. 움직임 줄이기면 반쯤 연 채로 멈춘다.
export function mouthAt(state, nowMs, { intervalMs = 150, reducedMotion = false } = {}) {
  if (state !== 'speaking') return 'closed';
  if (reducedMotion) return 'half';
  return Math.floor(nowMs / intervalMs) % 2 === 0 ? 'open' : 'closed';
}

// 밝은 색이면 얼굴 선을 어둡게, 어두운 색이면 밝게
function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#1f2937' : '#ffffff';
}

function bodyPath(shape) {
  if (shape === 'rounded') return '<rect x="10" y="10" width="80" height="80" rx="22" ry="22"';
  if (shape === 'drop') return '<path d="M50 6 C72 30 90 46 90 64 A40 32 0 0 1 10 64 C10 46 28 30 50 6 Z"';
  return '<circle cx="50" cy="52" r="42"';
}

function eye(cx, cy, eyes, state, ink, blink = false) {
  const dy = state === 'thinking' ? -4 : 0; // 생각할 때 눈이 위를 본다
  const big = state === 'listening' ? 1.35 : 1; // 들을 때 눈이 커진다
  if (blink) return `<path data-eye="closed" d="M${cx - 6} ${cy + dy} Q${cx} ${cy + dy + 4} ${cx + 6} ${cy + dy}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  if (eyes === 'line') return `<line x1="${cx - 6 * big}" y1="${cy + dy}" x2="${cx + 6 * big}" y2="${cy + dy}" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  if (eyes === 'dot') return `<circle cx="${cx}" cy="${cy + dy}" r="${2.5 * big}" fill="${ink}"/>`;
  return `<circle cx="${cx}" cy="${cy + dy}" r="${5 * big}" fill="${ink}"/>`;
}

function mouth(state, open, ink) {
  if (state === 'speaking') {
    const ry = open === 'open' ? 7 : open === 'half' ? 4 : 1.5;
    return `<ellipse data-mouth="${open}" cx="50" cy="68" rx="9" ry="${ry}" fill="${ink}"/>`;
  }
  if (state === 'thinking') return `<line data-mouth="closed" x1="43" y1="69" x2="57" y2="67" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  if (state === 'listening') return `<circle data-mouth="closed" cx="50" cy="68" r="3" fill="${ink}"/>`;
  return `<path data-mouth="closed" d="M41 66 Q50 73 59 66" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
}

function extras(state, color) {
  // 생각: 위에 점 셋, 듣기: 옆에 소리 결 두 줄
  if (state === 'thinking') return [70, 80, 90].map((x, i) => `<circle cx="${x}" cy="${12 - i * 2}" r="${2 + i}" fill="${color}" opacity="0.6"/>`).join('');
  if (state === 'listening') return `<path d="M95 40 Q101 52 95 64" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/><path d="M5 40 Q-1 52 5 64" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>`;
  return '';
}

const LABEL = { idle: '대기', listening: '듣는 중', thinking: '생각 중', speaking: '말하는 중' };

// SVG 글. 들어가는 값은 모두 위에서 검사한 값(모양·눈은 목록, 색은 #RRGGBB, 상태는 목록)뿐이다.
export function renderAvatar(look, state = 'idle', { mouth: open = 'closed', size = 96, name = '', blink = false } = {}) {
  const l = normalizeLook(look);
  const s = STATES.includes(state) ? state : 'idle';
  const ink = inkFor(l.color);
  const title = `${name ? `${String(name).replace(/[<>&"']/g, '')} · ` : ''}${LABEL[s]}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 0 112 100" width="${Number(size) || 96}" height="${Number(size) || 96}" role="img" aria-label="${title}" data-state="${s}" data-shape="${l.shape}" data-eyes="${l.eyes}">`
    + `<title>${title}</title>${extras(s, l.color)}${bodyPath(l.shape)} fill="${l.color}"/>`
    + `${eye(36, 46, l.eyes, s, ink, blink === true)}${eye(64, 46, l.eyes, s, ink, blink === true)}${mouth(s, MOUTHS.includes(open) ? open : 'closed', ink)}</svg>`;
}

// ---------- 립싱크·눈 깜빡임(2026-11-15 사용자 요청) ----------
// 화면(jarvis.html)이 1초에 약 30번 부른다. 모두 계산만 하고 소리·화면을 직접 건드리지 않는다(Node 시험 가능).
export const MOUTHS = ['closed', 'half', 'open'];

// 소리 크기(0~1) → 입 모양
export function levelMouth(level) {
  const l = Number.isFinite(level) ? level : 0;
  return l < 0.28 ? 'closed' : l < 0.6 ? 'half' : 'open';
}

// 소리 크기를 모를 때: 말소리 같은 박자(음절마다 길이가 조금씩 다름). ms = 말을 시작한 뒤 지난 시간.
const SYLLABLES = [['open', 140], ['half', 90], ['closed', 60], ['half', 110], ['open', 160], ['closed', 80],
  ['half', 120], ['open', 130], ['half', 90], ['closed', 150], ['open', 150], ['half', 100]];
const SYLLABLE_CYCLE = SYLLABLES.reduce((a, [, d]) => a + d, 0);
export function syllableMouth(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'closed';
  let t = ms % SYLLABLE_CYCLE;
  for (const [m, d] of SYLLABLES) { if (t < d) return m; t -= d; }
  return 'closed';
}

// 음성 엔진이 단어마다 알려 줄 때: 단어 길이(글자 수)만큼 음절 박자로 움직이고, 다음 단어까지는 다문다.
export function wordMouth(sinceMs, charLength) {
  const n = Number.isFinite(charLength) && charLength > 0 ? charLength : 2;
  const dur = Math.min(1200, Math.max(180, n * 140));
  return Number.isFinite(sinceMs) && sinceMs >= 0 && sinceMs < dur ? syllableMouth(sinceMs) : 'closed';
}

// 입이 얼마나 열렸는지(몸이 같이 들썩이는 정도, 0~1)
export function mouthAmount(m) { return m === 'open' ? 1 : m === 'half' ? 0.5 : 0; }

// PCM WAV(16비트 정수·32비트 실수) → 짧은 구간(frameMs)마다 소리 크기(0~1, 큰 소리 기준으로 맞춤).
// 모르는 형식이면 null(그때는 말소리 박자로 움직인다). 소리는 내지 않고 숫자만 읽는다.
export function wavEnvelope(input, frameMs = 20) {
  const u8 = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
  if (!u8 || u8.length < 44) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmt = null; let data = null;
  for (let o = 12; o + 8 <= u8.length;) {
    const id = tag(o); const size = dv.getUint32(o + 4, true); const body = o + 8;
    if (id === 'fmt ' && size >= 16) fmt = { format: dv.getUint16(body, true), channels: dv.getUint16(body + 2, true), rate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
    else if (id === 'data') { data = { start: body, end: Math.min(u8.length, body + size) }; break; }
    o = body + size + (size % 2);
  }
  if (!fmt || !data || !fmt.channels || !fmt.rate) return null;
  const int16 = fmt.format === 1 && fmt.bits === 16; const float32 = fmt.format === 3 && fmt.bits === 32;
  if (!int16 && !float32) return null;
  const bytes = fmt.bits / 8; const step = bytes * fmt.channels;
  const perFrame = Math.max(1, Math.round((fmt.rate * frameMs) / 1000));
  const total = Math.floor((data.end - data.start) / step);
  const raw = new Float32Array(Math.ceil(total / perFrame));
  for (let f = 0; f < raw.length; f += 1) {
    let sum = 0; let n = 0;
    for (let i = f * perFrame; i < Math.min(total, (f + 1) * perFrame); i += 1) {
      const o = data.start + i * step; // 첫 채널만 본다
      const x = int16 ? dv.getInt16(o, true) / 32768 : dv.getFloat32(o, true);
      sum += x * x; n += 1;
    }
    raw[f] = n ? Math.sqrt(sum / n) : 0;
  }
  // 가장 큰 소리 몇 개에 끌려가지 않게, 위에서 5% 지점을 1로 본다
  const sorted = Array.from(raw).sort((a, b) => a - b);
  const top = Math.max(sorted[Math.floor(sorted.length * 0.95)] ?? 0, 0.01);
  const levels = raw.map((x) => (x < 0.008 ? 0 : Math.min(1, x / top)));
  return { frameMs, levels };
}
export function envelopeAt(env, ms) {
  if (!env || !Number.isFinite(ms) || ms < 0) return 0;
  return env.levels[Math.floor(ms / env.frameMs)] ?? 0;
}

// 마이크 소리 크기(RMS) → 0~1. 작게 말해도 움직이게 최근 큰 소리에 맞춰 나눈다.
export function createLevelMeter({ attack = 0.6, release = 0.3, floor = 0.01 } = {}) {
  let env = 0; let peak = 0.05;
  return {
    push(rms) {
      const x = Number.isFinite(rms) && rms > 0 ? rms : 0;
      env += (x - env) * (x > env ? attack : release);
      peak = Math.max(peak * 0.99, env, 0.02);
      return this.level();
    },
    level() { return env < floor ? 0 : Math.min(1, env / peak); },
  };
}

// 눈 깜빡임: 2.5~6초마다 0.15초 감는다. 다섯 번에 한 번쯤은 두 번 연달아. rand는 0~1을 주는 함수(시험에서 고정).
export function createBlinker({ rand = Math.random, minGap = 2500, maxGap = 6000, closeMs = 150 } = {}) {
  let next = null; let until = -Infinity; let doubled = false;
  const gap = () => minGap + rand() * (maxGap - minGap);
  return {
    at(now) {
      if (next === null) next = now + gap();
      if (now >= next) {
        until = now + closeMs;
        if (!doubled && rand() < 0.2) { doubled = true; next = now + closeMs + 120; } else { doubled = false; next = now + gap(); }
      }
      return now < until;
    },
  };
}
