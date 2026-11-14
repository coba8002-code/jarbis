// 캐릭터 얼굴(T155 잠정안, FR-003a). 원본 그림이 없어 단순한 오리지널 도형 얼굴을 코드로 그린다.
// 외부 그림 자산·기존 캐릭터 모사는 쓰지 않는다. 화면(브라우저)과 Node 검사에서 같이 쓴다(외부 의존 없음).
// - 모양(shape)·색(color)·눈(eyes) 세 가지만 고른다.
// - 상태: idle(대기)·listening(듣기)·thinking(생각)·speaking(말하기).
// - 말하는 동안 입은 일정한 박자로 열리고 닫힌다. 소리 높낮이·음소에 맞춘 립싱크가 아니다.

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

function eye(cx, cy, eyes, state, ink) {
  const dy = state === 'thinking' ? -4 : 0; // 생각할 때 눈이 위를 본다
  const big = state === 'listening' ? 1.35 : 1; // 들을 때 눈이 커진다
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
export function renderAvatar(look, state = 'idle', { mouth: open = 'closed', size = 96, name = '' } = {}) {
  const l = normalizeLook(look);
  const s = STATES.includes(state) ? state : 'idle';
  const ink = inkFor(l.color);
  const title = `${name ? `${String(name).replace(/[<>&"']/g, '')} · ` : ''}${LABEL[s]}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 0 112 100" width="${Number(size) || 96}" height="${Number(size) || 96}" role="img" aria-label="${title}" data-state="${s}" data-shape="${l.shape}" data-eyes="${l.eyes}">`
    + `<title>${title}</title>${extras(s, l.color)}${bodyPath(l.shape)} fill="${l.color}"/>`
    + `${eye(36, 46, l.eyes, s, ink)}${eye(64, 46, l.eyes, s, ink)}${mouth(s, open, ink)}</svg>`;
}
