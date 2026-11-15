// 캐릭터 모션(2026-11-15, 기획: docs/CHARACTER_MOTION.md).
// 한 번 하는 동작 16가지 · 상태별 반복 · 대기 잔동작 · 머리 위 감정 표시 · 답 내용 반응 · 얼굴 누르기 · 친구별 성격.
// transform·opacity만 움직인다. 움직임 줄이기·쉬는 화면에서는 모두 멈춘다.
// 위쪽 함수들(DOM 없음)은 검사(test/motion.test.js)에서 그대로 부른다.

// dur: 기본 길이(ms), pri: 우선순위(1 잔동작 < 2 사건 < 3 사용자가 직접 누름), jump: 뛰어올라 그림자가 작아짐, emote: [종류, 개수]
export const MOTIONS = {
  hop: { dur: 600, pri: 2, jump: true, emote: ['sparkle', 2], ko: '깡충' },
  nod: { dur: 500, pri: 2, ko: '끄덕' },
  tilt: { dur: 1200, pri: 1, ko: '갸웃' },
  peek: { dur: 1600, pri: 1, ko: '두리번' },
  wiggle: { dur: 700, pri: 1, ko: '꼬물꼬물' },
  bounce: { dur: 800, pri: 1, jump: true, ko: '콩콩' },
  stretch: { dur: 1400, pri: 1, emote: ['sparkle', 1], ko: '기지개' },
  spin: { dur: 900, pri: 2, jump: true, emote: ['sparkle', 2], ko: '빙그르' },
  cheer: { dur: 1000, pri: 2, jump: true, emote: ['star', 4], ko: '만세 점프' },
  sad: { dur: 1400, pri: 2, emote: ['sweat', 1], ko: '시무룩' },
  shy: { dur: 1200, pri: 2, emote: ['heart', 2], ko: '수줍' },
  doze: { dur: 2200, pri: 1, emote: ['zzz', 2], ko: '꾸벅' },
  greet: { dur: 1200, pri: 2, emote: ['heart', 1], ko: '흔들흔들 인사' },
  popin: { dur: 600, pri: 2, emote: ['sparkle', 3], ko: '뿅 등장' },
  startle: { dur: 500, pri: 2, emote: ['exclaim', 1], ko: '깜짝' },
  dance: { dur: 1600, pri: 2, emote: ['note', 3], ko: '둠칫' },
};
export const EMOTES = ['heart', 'sparkle', 'star', 'note', 'sweat', 'zzz', 'question', 'exclaim'];
export const MAX_EMOTES = 6;
export const IDLE_GAP = [7000, 15000];
export const DOZE_AFTER = 90_000;
export const DOZE_EVERY = 120_000;

// 친구별 성격: 이름으로 찾는다(그림 친구 이름 기준). 없으면 보통.
const CALM = ['늘보', '카피'];
const LIVELY = ['토리', '콩이', '몽이', '솔이'];
const SHY = ['기니', '나비'];
export const TEMPERAMENTS = {
  calm: { speed: 1.4, gap: 1.4, weights: { tilt: 3, peek: 1, wiggle: 1, bounce: 1, stretch: 4 } },
  lively: { speed: 0.8, gap: 0.7, weights: { tilt: 1, peek: 2, wiggle: 4, bounce: 4, stretch: 1 } },
  shy: { speed: 1, gap: 1, weights: { tilt: 4, peek: 3, wiggle: 2, bounce: 1, stretch: 1 } },
  normal: { speed: 1, gap: 1, weights: { tilt: 2, peek: 2, wiggle: 2, bounce: 2, stretch: 1 } },
};
export function temperamentOf(name) {
  const n = String(name ?? '').trim();
  if (CALM.includes(n)) return 'calm';
  if (LIVELY.includes(n)) return 'lively';
  if (SHY.includes(n)) return 'shy';
  return 'normal';
}

// 대기 잔동작 고르기: 성격 비율대로, 방금 한 것은 빼고.
export function pickFidget({ rand = Math.random, last = null, temperament = 'normal' } = {}) {
  const w = TEMPERAMENTS[temperament]?.weights ?? TEMPERAMENTS.normal.weights;
  const pool = Object.entries(w).filter(([k]) => k !== last);
  const total = pool.reduce((s, [, v]) => s + v, 0);
  let r = rand() * total;
  for (const [k, v] of pool) { r -= v; if (r < 0) return k; }
  return pool.at(-1)[0];
}
// 다음 잔동작까지 기다릴 시간(ms)
export function idleGap({ rand = Math.random, temperament = 'normal' } = {}) {
  const g = TEMPERAMENTS[temperament]?.gap ?? 1;
  return Math.round((IDLE_GAP[0] + rand() * (IDLE_GAP[1] - IDLE_GAP[0])) * g);
}

// 답 내용 → 반응(앞에서부터 처음 맞는 것). 없으면 null.
const FEELINGS = [
  { re: /축하|좋아요|좋아!|최고|멋져|멋지|대단|신나|기뻐|기쁘|야호|훌륭/, motion: 'bounce', emote: ['sparkle', 3] },
  { re: /고마워|고맙|감사|귀여|사랑|칭찬|잘했/, motion: 'shy', emote: ['heart', 2] },
  { re: /미안|죄송|아쉽|슬퍼|슬프|모르겠|못 찾|찾지 못|할 수 없|어려워/, motion: 'sad', emote: ['sweat', 1] },
  { re: /노래|음악|♪|♬|흥얼/, motion: 'dance', emote: ['note', 3] },
];
export function emotionOf(text) {
  const t = String(text ?? '').slice(0, 400);
  if (!t.trim()) return null;
  for (const f of FEELINGS) if (f.re.test(t)) return { motion: f.motion, emote: f.emote };
  if (/[?？]\s*$/.test(t.trim())) return { motion: 'tilt', emote: ['question', 1] };
  return null;
}

// 얼굴 누르기: 1.5초 안에 누른 횟수 → 동작·하트 수·말
export const POKE_WINDOW = 1500;
export const POKE_LINES = ['히히', '간지러워요!', '헤헤', '왜 불러요?', '좋아요!'];
export function pokeLevel(count) {
  if (count >= 3) return { motion: 'spin', emote: ['heart', 3] };
  if (count === 2) return { motion: 'bounce', emote: ['heart', 2] };
  return { motion: 'wiggle', emote: ['heart', 1] };
}

// 감정 표시 개수 제한: 지금 떠 있는 수를 보고 더 띄울 수만큼만
export const emoteRoom = (showing, want) => Math.max(0, Math.min(want, MAX_EMOTES - showing));

// ---------- 그림(감정 표시) ----------
const SVG = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" width="100%" height="100%" aria-hidden="true">${inner}</svg>`;
const EMOTE_SVG = {
  heart: SVG('<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" fill="#f472b6" stroke="#db2777" stroke-width="1.2"/>'),
  sparkle: SVG('<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="#fcd34d" stroke="#d97706" stroke-width="1"/>'),
  star: SVG('<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="#fbbf24" stroke="#d97706" stroke-width="1"/>'),
  note: SVG('<path d="M9 18V5l11-2v12" fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="3" fill="#8b5cf6"/><circle cx="17.5" cy="15" r="3" fill="#8b5cf6"/>'),
  sweat: SVG('<path d="M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11z" fill="#93c5fd" stroke="#3b82f6" stroke-width="1.2"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2 2.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>'),
  zzz: SVG('<text x="4" y="19" font-size="18" font-weight="700" font-family="system-ui, sans-serif" fill="#7c8db5">Z</text>'),
  question: SVG('<circle cx="12" cy="12" r="10" fill="#fff7ed" stroke="#f97316" stroke-width="1.4"/><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" font-family="system-ui, sans-serif" fill="#ea580c">?</text>'),
  exclaim: SVG('<circle cx="12" cy="12" r="10" fill="#fef2f2" stroke="#ef4444" stroke-width="1.4"/><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" font-family="system-ui, sans-serif" fill="#dc2626">!</text>'),
};

const KEYFRAMES = `
@keyframes m-hop { 0%{transform:none} 18%{transform:translateY(0) scale(1.1,.88)} 45%{transform:translateY(-30px) scale(.94,1.08)} 68%{transform:translateY(0) scale(1.08,.92)} 84%{transform:translateY(-4px) scale(.98,1.02)} 100%{transform:none} }
@keyframes m-nod { 0%{transform:none} 30%{transform:translateY(6px) scale(1.03,.95)} 60%{transform:translateY(-2px)} 100%{transform:none} }
@keyframes m-tilt { 0%{transform:none} 25%{transform:rotate(-10deg)} 60%{transform:rotate(-10deg)} 80%{transform:rotate(3deg)} 100%{transform:none} }
@keyframes m-peek { 0%{transform:none} 20%,40%{transform:translateX(-10px) rotate(-6deg)} 60%,80%{transform:translateX(10px) rotate(6deg)} 100%{transform:none} }
@keyframes m-wiggle { 0%{transform:none} 15%{transform:rotate(-7deg) scale(1.03,.97)} 30%{transform:rotate(7deg)} 45%{transform:rotate(-5deg)} 60%{transform:rotate(5deg)} 75%{transform:rotate(-2deg)} 100%{transform:none} }
@keyframes m-bounce { 0%{transform:none} 12%{transform:scale(1.08,.9)} 28%{transform:translateY(-14px) scale(.96,1.05)} 44%{transform:translateY(0) scale(1.08,.92)} 60%{transform:translateY(-10px) scale(.97,1.04)} 78%{transform:translateY(0) scale(1.05,.95)} 100%{transform:none} }
@keyframes m-stretch { 0%{transform:none} 30%{transform:scale(.92,1.14)} 55%{transform:scale(.92,1.14) rotate(2deg)} 75%{transform:scale(1.08,.92)} 100%{transform:none} }
@keyframes m-spin { 0%{transform:none} 20%{transform:scale(1.06,.9)} 60%{transform:translateY(-18px) rotate(360deg) scale(.96,1.05)} 85%{transform:translateY(0) rotate(360deg) scale(1.06,.94)} 100%{transform:rotate(360deg)} }
@keyframes m-cheer { 0%{transform:none} 15%{transform:scale(1.12,.86)} 40%{transform:translateY(-38px) scale(.92,1.12)} 55%{transform:translateY(-38px) rotate(-6deg) scale(.95,1.08)} 70%{transform:translateY(0) scale(1.12,.88)} 85%{transform:translateY(-6px)} 100%{transform:none} }
@keyframes m-sad { 0%{transform:none} 25%{transform:translateY(10px) scale(1.04,.92)} 40%{transform:translateY(10px) scale(1.04,.92) rotate(-3deg)} 55%{transform:translateY(10px) scale(1.04,.92) rotate(3deg)} 70%{transform:translateY(10px) scale(1.04,.92) rotate(-2deg)} 100%{transform:none} }
@keyframes m-shy { 0%{transform:none} 25%,55%{transform:translateX(-4px) rotate(-8deg) scale(.93)} 70%{transform:rotate(4deg) scale(.96)} 100%{transform:none} }
@keyframes m-doze { 0%{transform:none} 40%{transform:translateY(8px) rotate(6deg) scale(1.02,.96)} 60%{transform:translateY(10px) rotate(8deg) scale(1.02,.95)} 72%{transform:translateY(-4px) rotate(-2deg) scale(.98,1.03)} 86%{transform:none} 100%{transform:none} }
@keyframes m-greet { 0%{transform:none} 15%{transform:rotate(-9deg)} 35%{transform:rotate(9deg)} 55%{transform:rotate(-7deg)} 75%{transform:rotate(5deg)} 100%{transform:none} }
@keyframes m-popin { 0%{transform:scale(.55);opacity:.2} 55%{transform:scale(1.08,.94);opacity:1} 75%{transform:scale(.97,1.03)} 100%{transform:none;opacity:1} }
@keyframes m-startle { 0%{transform:none} 20%{transform:translateY(-8px) scale(1.08,1.1)} 40%{transform:scale(.98)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} 100%{transform:none} }
@keyframes m-dance { 0%,50%,100%{transform:none} 12.5%,62.5%{transform:rotate(-8deg) translateY(-6px)} 25%,75%{transform:scale(1.05,.95)} 37.5%,87.5%{transform:rotate(8deg) translateY(-6px)} }
@keyframes m-shadow { 0%,100%{transform:none;opacity:1} 45%{transform:scale(.7);opacity:.55} }
@keyframes m-listen { 0%,100%{transform:rotate(-3deg) scale(1.02)} 50%{transform:rotate(-1deg) scale(1.045)} }
@keyframes m-think { 0%,100%{transform:rotate(-6deg) translateX(-3px)} 50%{transform:rotate(6deg) translateX(3px)} }
@keyframes m-float { 0%{transform:translate(0,0) scale(.5) rotate(0);opacity:0} 15%{transform:translate(calc(var(--dx)*.2),-10px) scale(1.1) rotate(calc(var(--rot)*.3));opacity:1} 70%{opacity:1} 100%{transform:translate(var(--dx),-78px) scale(.9) rotate(var(--rot));opacity:0} }
@keyframes m-dot { 0%,100%{transform:translateY(0);opacity:.35} 40%{transform:translateY(-4px);opacity:1} }
`;
const CSS = `${KEYFRAMES}
#face .fx { --spd: 1; }
${Object.entries(MOTIONS).map(([k, m]) => `#face .fx.m-${k}{animation:m-${k} calc(${m.dur}ms * var(--spd)) ${k === 'popin' ? 'cubic-bezier(.2,.9,.3,1.3)' : 'ease-in-out'} both}`).join('\n')}
.scene.m-jump .ground { animation: m-shadow calc(var(--jump-ms, 600ms) * var(--spd, 1)) ease-in-out; }
#face[data-state="listening"] { animation: m-listen 1.2s ease-in-out infinite; }
#face[data-state="thinking"] { animation: m-think 1.8s ease-in-out infinite; }
.m-emotes { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 1; }
.m-emote { position: absolute; width: 26px; height: 26px; margin-left: -13px; animation: m-float var(--life, 1600ms) ease-out forwards; }
.m-emote.big { width: 32px; height: 32px; margin-left: -16px; }
.m-think { position: absolute; display: flex; gap: 6px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); box-shadow: var(--shadow); opacity: 0; transform: scale(.8); transition: opacity 200ms ease-out, transform 200ms ease-out; pointer-events: none; z-index: 1; }
.m-think i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); animation: m-dot 1.2s ease-in-out infinite; }
.m-think i:nth-child(2) { animation-delay: .15s; } .m-think i:nth-child(3) { animation-delay: .3s; }
.scene.m-thinking .m-think { opacity: 1; transform: none; }
#face { cursor: pointer; -webkit-tap-highlight-color: transparent; }
body.asleep .m-emotes, body.asleep .m-think { display: none; }
@media (prefers-reduced-motion: reduce) {
  #face .fx[class*="m-"], .scene.m-jump .ground, .m-think i { animation: none !important; }
  .m-emotes { display: none; }
  .m-think { transition: none; }
}
`;

// ---------- 화면에 붙이기 ----------
// fx: #face .fx · face: #face · scene: .scene · getState(): 지금 상태 · getName(): 지금 친구 이름
// isAsleep(): 쉬는 화면인지 · isBusy(): 답을 기다리는 중인지 · say(text): 말풍선
export function createMotion({ fx, face, scene, reducedMotion = false, isAsleep = () => false, getState = () => 'idle', getName = () => '', isBusy = () => false, say = () => {}, rand = Math.random, now = () => performance.now(), doc = document } = {}) {
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.append(style);
  const layer = doc.createElement('div');
  layer.className = 'm-emotes';
  layer.setAttribute('aria-hidden', 'true');
  const think = doc.createElement('div');
  think.className = 'm-think';
  think.setAttribute('aria-hidden', 'true');
  think.innerHTML = '<i></i><i></i><i></i>';
  scene.append(layer, think);

  const st = { playing: null, until: 0, timer: null, lastFidget: null, nextFidgetAt: now() + 4000, lastActive: now(), lastDoze: 0, lastState: getState(), pokes: [], temperament: 'normal', pending: null };
  const off = () => reducedMotion || isAsleep() || doc.hidden;
  const hiddenFace = () => face.offsetWidth === 0; // 일정·장치 점검 화면처럼 캐릭터가 가려져 있음

  function place() {
    // 머리 위쪽(얼굴 상자 위 20% 지점)과 오른쪽 위(생각 점)
    const top = face.offsetTop + face.offsetHeight * 0.18;
    think.style.left = `${face.offsetLeft + face.offsetWidth * 0.72}px`;
    think.style.top = `${Math.max(0, face.offsetTop - 4)}px`;
    return { top, left: face.offsetLeft + face.offsetWidth / 2, width: face.offsetWidth };
  }

  function emote(kind, count = 1) {
    if (off() || hiddenFace() || !EMOTE_SVG[kind]) return 0;
    const n = emoteRoom(layer.childElementCount, count);
    const { top, left, width } = place();
    for (let i = 0; i < n; i += 1) {
      const e = doc.createElement('span');
      e.className = `m-emote${kind === 'question' || kind === 'exclaim' ? ' big' : ''}`;
      e.innerHTML = EMOTE_SVG[kind];
      const spread = width * 0.42;
      const x = kind === 'question' || kind === 'exclaim' ? left + width * 0.3 : left + (rand() * 2 - 1) * spread;
      e.style.left = `${Math.round(x)}px`;
      e.style.top = `${Math.round(top - rand() * 16)}px`;
      e.style.setProperty('--dx', `${Math.round((rand() * 2 - 1) * 26)}px`);
      e.style.setProperty('--rot', `${Math.round((rand() * 2 - 1) * 24)}deg`);
      e.style.setProperty('--life', `${1400 + Math.round(rand() * 500)}ms`);
      e.style.animationDelay = `${i * 140}ms`;
      e.addEventListener('animationend', () => e.remove());
      setTimeout(() => e.remove(), 3000); // 끝 알림이 안 와도 지움
      layer.append(e);
    }
    return n;
  }

  function stop() {
    for (const k of Object.keys(MOTIONS)) fx.classList.remove(`m-${k}`);
    scene.classList.remove('m-jump');
    st.playing = null;
  }

  // 한 번 하는 동작. pri가 지금 동작보다 낮으면(끝나기 전) 하지 않는다.
  function play(name, { pri, emote: withEmote = true } = {}) {
    const m = MOTIONS[name];
    if (!m || off()) return false;
    const p = pri ?? m.pri;
    // 캐릭터가 가려져 있으면 사건 동작(만세 등)은 미뤄 두었다가 다시 보일 때 한다. 잔동작은 버린다.
    if (hiddenFace()) { if (p >= 2) st.pending = name; return false; }
    const t = now();
    if (st.playing && t < st.until && p < st.playing.pri) return false;
    const spd = TEMPERAMENTS[st.temperament]?.speed ?? 1;
    stop();
    void fx.offsetWidth; // 같은 동작도 처음부터
    fx.style.setProperty('--spd', String(spd));
    fx.classList.add(`m-${name}`);
    if (m.jump) { scene.style.setProperty('--jump-ms', `${m.dur}ms`); scene.style.setProperty('--spd', String(spd)); void scene.offsetWidth; scene.classList.add('m-jump'); }
    st.playing = { name, pri: p };
    st.until = t + m.dur * spd;
    clearTimeout(st.timer);
    st.timer = setTimeout(() => { if (st.playing?.name === name) stop(); }, m.dur * spd + 60);
    if (withEmote && m.emote) emote(...m.emote);
    // 사건·누르기 동작 뒤에는 잔동작을 바로 잇지 않는다(끝난 뒤 다시 7~15초)
    if (p >= 2) { st.lastActive = t; st.nextFidgetAt = st.until + idleGap({ rand, temperament: st.temperament }); }
    return true;
  }

  // 답 내용에 맞춰 한 번 반응
  function react(text) {
    const f = emotionOf(text);
    if (!f) return null;
    play(f.motion, { emote: false });
    emote(...f.emote);
    return f.motion;
  }

  // 얼굴 누르기(쓰다듬기)
  function poke() {
    const t = now();
    st.pokes = st.pokes.filter((x) => t - x < POKE_WINDOW);
    st.pokes.push(t);
    st.lastActive = t;
    const lv = pokeLevel(st.pokes.length);
    if (!play(lv.motion, { pri: 3, emote: false })) return null;
    emote(...lv.emote);
    if (getState() === 'idle' && !isBusy()) say(POKE_LINES[Math.floor(rand() * POKE_LINES.length)]);
    return lv.motion;
  }

  // 쉬는 화면에서 깼을 때: 기지개 → 깡충
  function wake() {
    st.lastActive = now();
    if (!play('stretch', { pri: 2 })) return;
    setTimeout(() => play('hop'), (MOTIONS.stretch.dur * (TEMPERAMENTS[st.temperament]?.speed ?? 1)) + 80);
  }

  // 화면을 처음 열 때: 뿅 → 흔들흔들 인사
  function hello() {
    if (!play('popin')) return;
    setTimeout(() => play('greet'), MOTIONS.popin.dur + 200);
  }

  // 0.5초마다: 성격 반영, 생각 점, 생각 시작 갸웃, 대기 잔동작, 오래 쉬면 꾸벅
  function tick() {
    st.temperament = temperamentOf(getName());
    const state = getState();
    const t = now();
    if (state !== st.lastState) {
      if (state === 'thinking' && !off()) { place(); if (play('tilt', { pri: 1, emote: false })) emote('question', 1); }
      st.lastState = state;
    }
    scene.classList.toggle('m-thinking', state === 'thinking' && !isAsleep());
    if (st.pending && !hiddenFace() && !off()) { const name = st.pending; st.pending = null; play(name); }
    if (state !== 'idle' || isBusy()) { st.lastActive = t; st.nextFidgetAt = t + idleGap({ rand, temperament: st.temperament }); return; }
    if (off() || (st.playing && t < st.until)) return;
    if (t - st.lastActive > DOZE_AFTER && t - st.lastDoze > DOZE_EVERY) {
      st.lastDoze = t;
      play('doze');
      st.nextFidgetAt = t + idleGap({ rand, temperament: st.temperament });
      return;
    }
    if (t >= st.nextFidgetAt) {
      const name = pickFidget({ rand, last: st.lastFidget, temperament: st.temperament });
      st.lastFidget = name;
      play(name);
      st.nextFidgetAt = t + idleGap({ rand, temperament: st.temperament });
    }
  }
  const interval = setInterval(tick, 500);
  face.addEventListener('click', () => poke());

  return { play, emote, react, poke, wake, hello, tick, stop, state: st, destroy: () => { clearInterval(interval); clearTimeout(st.timer); style.remove(); layer.remove(); think.remove(); } };
}
