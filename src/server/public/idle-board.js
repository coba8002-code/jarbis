// 대기화면(쉬는 화면) 보드(2026-11-15 사용자 요청).
// 지금 고른 캐릭터(친구)가 꾸벅꾸벅 조는 간단하고 코믹한 연출 + 날씨 + 오늘 중요한 일 + 해야 할 일(지금은 구글 Tasks, 나중에 ax.designjux.com).
// jarvis.html은 mountIdleBoard(hooks)와 show()/hide()만 부른다. 화면 번인을 줄이려고 1분마다 몇 px씩 자리를 옮긴다.
// 움직임 줄이기면 잠든 그림만 가만히 보인다.

const $ = (s, root = document) => root.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'html') n.innerHTML = v;
    else if (v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
};
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 코믹 잠꼬대(겹치지 않게 돌아가며). say: 말풍선, open: 눈 뜬 그림으로 잠깐 바꿈
export const GAGS = [
  { id: 'startle', ms: 1500, say: '헉! …아니구나', open: true },
  { id: 'roll', ms: 1000, say: '' },
  { id: 'yawn', ms: 1800, say: '하아아암~' },
  { id: 'bubble', ms: 2600, say: '' },
  { id: 'dream', ms: 2600, say: '냠냠… 한 입만…' },
  { id: 'wobble', ms: 1600, say: '꾸벅… 꾸벅…' },
];
export const GAG_GAP = [14000, 24000];
// 다음 잠꼬대 고르기: 방금 한 것은 빼고
export function nextGag(rand = Math.random, last = null) {
  const pool = GAGS.filter((g) => g.id !== last);
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
// 할 일 기한 글
export function dueText(due, today = dayOf(new Date())) {
  if (!due) return '';
  if (due < today) return '기한 지남';
  if (due === today) return '오늘까지';
  const [, m, d] = due.split('-').map(Number);
  return `${m}/${d}까지`;
}

const WX = {
  sun: '<circle cx="12" cy="12" r="4.5" fill="#fcd34d"/><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" stroke="#fcd34d" stroke-width="1.8" stroke-linecap="round"/>',
  partly: '<circle cx="9" cy="9" r="3.6" fill="#fcd34d"/><path d="M7 19h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 7 19z" fill="#e7e2dc"/>',
  cloud: '<path d="M6.5 19h11a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 6.5 19z" fill="#cfc8c0"/>',
  rain: '<path d="M6.5 15h11a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 6.5 15z" fill="#cfc8c0"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="#93c5fd" stroke-width="1.8" stroke-linecap="round"/>',
  snow: '<path d="M6.5 15h11a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 6.5 15z" fill="#cfc8c0"/><circle cx="8" cy="19.5" r="1.2" fill="#fff"/><circle cx="12" cy="20.5" r="1.2" fill="#fff"/><circle cx="16" cy="19.5" r="1.2" fill="#fff"/>',
};
const wxSvg = (k) => `<svg viewBox="0 0 24 24" width="56" height="56" fill="none" aria-hidden="true">${WX[k] ?? WX.cloud}</svg>`;

const CSS = `
body.asleep .sleep.has-board { justify-content: center; overflow: hidden; gap: 24px; padding: 32px 24px 24px; }
.ib { width: 100%; max-width: 680px; display: flex; flex-direction: column; align-items: stretch; gap: 28px; transition: transform 1.2s ease-in-out; }
.ib-l, .ib-r { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.ib-top { text-align: center; }
.ib-top .sleep-time { font-size: clamp(56px, 12vw, 112px); }
.ib-date { margin-top: 4px; font-size: clamp(16px, 2.6vw, 22px); color: #b8ada1; }
.ib-mid { display: flex; align-items: center; justify-content: center; gap: clamp(16px, 4vw, 40px); margin-top: 8px; }
.ib-stage { --st: clamp(150px, 30vw, 260px); position: relative; width: var(--st); height: var(--st); flex: 0 0 var(--st); }
.ib-char { position: absolute; inset: 0; transform-origin: 50% 92%; animation: ib-doze 3.6s ease-in-out infinite; }
.ib-char img, .ib-char svg { width: 100%; height: 100%; object-fit: contain; }
.ib-flip { width: 100%; height: 100%; transition: transform 700ms ease-in-out; }
.ib-stage.flipped .ib-flip { transform: scaleX(-1); }
.ib-shadow { position: absolute; left: 22%; right: 22%; bottom: -4px; height: 10px; border-radius: 50%; background: rgba(255, 240, 220, .08); }
.ib-z { position: absolute; top: 4px; right: 0; font: 700 22px/1 system-ui, sans-serif; color: #a5b4fc; opacity: 0; animation: ib-z 3.6s ease-out infinite; }
.ib-z:nth-of-type(2) { animation-delay: 1.2s; font-size: 18px; }
.ib-z:nth-of-type(3) { animation-delay: 2.4s; font-size: 14px; }
.ib-say { position: absolute; left: 50%; top: -18px; transform: translate(-50%, 6px); padding: 6px 12px; border-radius: 14px; background: #f3ede6; color: #1f1a17; font-size: 14px; font-weight: 600; white-space: nowrap; opacity: 0; transition: opacity 200ms ease-out, transform 200ms ease-out; pointer-events: none; }
.ib-say.on { opacity: 1; transform: translate(-50%, 0); }
.ib-bub { position: absolute; left: 58%; top: 52%; width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(147, 197, 253, .9); background: rgba(147, 197, 253, .18); transform: scale(0); opacity: 0; }
.ib-dream { position: absolute; right: -28px; top: -6px; width: 44px; height: 34px; border-radius: 18px; background: #f3ede6; opacity: 0; transform: scale(.6); display: flex; align-items: center; justify-content: center; }
.ib-dream svg { width: 22px; height: 22px; }
.ib-weather { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ib-weather > div:first-child svg { width: clamp(56px, 10vw, 88px); height: clamp(56px, 10vw, 88px); }
.ib-wx-temp { font-size: clamp(44px, 8vw, 72px); font-weight: 600; color: #f3ede6; line-height: 1; font-variant-numeric: tabular-nums; }
.ib-wx-text { font-size: clamp(16px, 2.6vw, 22px); color: #d6cfc7; }
.ib-wx-sub { font-size: 14px; color: #9a9088; }
.ib-off { font-size: 14px; color: #9a9088; max-width: 22ch; text-align: left; }
.ib-card { padding: 16px 20px; border: 1px solid rgba(255, 240, 220, .10); border-radius: 20px; background: rgba(255, 240, 220, .04); text-align: left; }
.ib-card h2 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px; font-size: clamp(16px, 2.4vw, 20px); font-weight: 600; color: #f3ede6; }
.ib-card h2 small { font-size: 12px; font-weight: 500; color: #9a9088; }
.ib-card ul { list-style: none; margin: 0; padding: 0; }
.ib-card li { display: flex; align-items: baseline; gap: 12px; padding: 8px 0; border-top: 1px solid rgba(255, 240, 220, .07); font-size: clamp(17px, 2.8vw, 22px); color: #e7e2dc; }
.ib-card li:first-child { border-top: 0; }
.ib-card li .t { flex: 0 0 auto; min-width: 84px; font-size: 14px; color: #9a9088; font-variant-numeric: tabular-nums; }
.ib-card li .t.late, .ib-card li .d.late { color: #f87171; }
.ib-card li .x { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ib-card li .d { flex: 0 0 auto; font-size: 13px; color: #9a9088; }
.ib-card .dot { flex: 0 0 10px; width: 10px; height: 10px; border: 2px solid #9a9088; border-radius: 50%; transform: translateY(2px); }
.ib-empty { padding: 4px 0; font-size: 14px; color: #9a9088; }
/* 가로 화면: 왼쪽(시계·캐릭터·날씨) · 오른쪽(오늘 중요한 일·해야 할 일) */
@media (min-width: 900px) and (min-aspect-ratio: 1/1) {
  .ib { max-width: 1160px; flex-direction: row; align-items: center; gap: 48px; }
  .ib-l, .ib-r { flex: 1 1 0; }
  .ib-top .sleep-time { font-size: clamp(64px, 7vw, 104px); }
  .ib-stage { --st: clamp(150px, 16vw, 240px); }
}
@keyframes ib-doze { 0%, 100% { transform: rotate(-3deg) translateY(0) scale(1, 1); } 50% { transform: rotate(4deg) translateY(5px) scale(1.02, .97); } }
@keyframes ib-z { 0% { opacity: 0; transform: translate(0, 8px) scale(.6); } 20% { opacity: .9; } 100% { opacity: 0; transform: translate(18px, -42px) scale(1.15); } }
@keyframes ib-startle { 0% { transform: none; } 15% { transform: translateY(-34px) scale(.92, 1.1); } 30% { transform: translateY(0) scale(1.1, .9); } 45%, 75% { transform: rotate(-6deg); } 60% { transform: rotate(6deg); } 100% { transform: none; } }
@keyframes ib-yawn { 0% { transform: none; } 35%, 60% { transform: scale(.9, 1.16) translateY(-4px); } 80% { transform: scale(1.08, .92); } 100% { transform: none; } }
@keyframes ib-bub { 0% { transform: scale(0); opacity: 0; } 15% { opacity: 1; } 45% { transform: scale(1); } 55% { transform: scale(.85); } 80% { transform: scale(1.35); opacity: 1; } 84% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(0); opacity: 0; } }
@keyframes ib-dream { 0% { opacity: 0; transform: scale(.6); } 15%, 85% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(.6); } }
@keyframes ib-wobble { 0%, 100% { transform: none; } 20% { transform: rotate(-12deg) translateY(6px); } 35% { transform: rotate(-2deg); } 55% { transform: rotate(10deg) translateY(6px); } 70% { transform: rotate(1deg); } }
.ib-stage.g-startle .ib-char { animation: ib-startle 1.5s ease-in-out; }
.ib-stage.g-yawn .ib-char { animation: ib-yawn 1.8s ease-in-out; }
.ib-stage.g-wobble .ib-char { animation: ib-wobble 1.6s ease-in-out; }
.ib-stage.g-bubble .ib-bub { animation: ib-bub 2.6s ease-in-out; }
.ib-stage.g-dream .ib-dream { animation: ib-dream 2.6s ease-in-out; }
.ib-stage.g-startle .ib-z, .ib-stage.g-yawn .ib-z { animation: none; opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .ib-char, .ib-z, .ib-stage[class*="g-"] .ib-char, .ib-bub, .ib-dream { animation: none !important; }
  .ib-z { opacity: .7; } .ib-z:nth-of-type(n+2) { display: none; }
  .ib, .ib-flip, .ib-say { transition: none; }
}
`;

// hooks: { api, faces() → { sleep: url|null, awake: url|null, svgSleep: html, svgAwake: html, name }, reducedMotion, rand }
export function mountIdleBoard(hooks) {
  const { api, reducedMotion = false, rand = Math.random } = hooks;
  document.head.append(el('style', {}, CSS));
  const sleep = $('#sleep');
  sleep.classList.add('has-board');
  const time = $('#sleep-time');
  const hint = $('#sleep-hint');
  const date = el('div', { class: 'ib-date', id: 'ib-date' });
  const flip = el('div', { class: 'ib-flip' });
  const char = el('div', { class: 'ib-char', 'aria-hidden': 'true' }, flip);
  const say = el('span', { class: 'ib-say', 'aria-hidden': 'true' });
  const stage = el('div', { class: 'ib-stage', id: 'ib-stage' },
    el('div', { class: 'ib-shadow' }), char,
    el('span', { class: 'ib-z' }, 'Z'), el('span', { class: 'ib-z' }, 'Z'), el('span', { class: 'ib-z' }, 'z'),
    el('span', { class: 'ib-bub' }), el('span', { class: 'ib-dream', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.4 5.6 6 .5-4.6 4 1.4 5.9L12 16l-5.2 3 1.4-5.9-4.6-4 6-.5z" fill="#fbbf24"/></svg>' }),
    say);
  const weather = el('div', { class: 'ib-weather', id: 'ib-weather', role: 'group', 'aria-label': '날씨' });
  const impList = el('ul', { id: 'ib-important' });
  const todoList = el('ul', { id: 'ib-todos' });
  const todoSrc = el('small', { id: 'ib-todo-src' }, '');
  const board = el('div', { class: 'ib', id: 'idle-board' },
    el('div', { class: 'ib-l' }, el('div', { class: 'ib-top' }, time, date), el('div', { class: 'ib-mid' }, stage, weather)),
    el('div', { class: 'ib-r' },
      el('section', { class: 'ib-card', 'aria-labelledby': 'ib-imp-h' }, el('h2', { id: 'ib-imp-h' }, '오늘 중요한 일'), impList),
      el('section', { class: 'ib-card', 'aria-labelledby': 'ib-todo-h' }, el('h2', { id: 'ib-todo-h' }, '해야 할 일', todoSrc), todoList)));
  sleep.replaceChildren(board, hint);

  const st = { shown: false, timer: null, gagTimer: null, refresh: null, lastGag: null, sayTimer: null, eyesOpen: false };
  function drawFace() {
    const f = hooks.faces?.() ?? {};
    const src = st.eyesOpen ? (f.awake ?? f.sleep) : (f.sleep ?? f.awake);
    if (src) {
      let img = flip.querySelector('img');
      if (!img) { img = el('img', { alt: '' }); flip.replaceChildren(img); }
      if (img.getAttribute('src') !== src) img.src = src;
    } else {
      const html = st.eyesOpen ? (f.svgAwake ?? '') : (f.svgSleep ?? f.svgAwake ?? '');
      if (flip.dataset.html !== html) { flip.innerHTML = html; flip.dataset.html = html; }
    }
  }
  function showDate() {
    const d = new Date();
    date.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`;
  }
  function speak(text, ms) {
    clearTimeout(st.sayTimer);
    if (!text) { say.classList.remove('on'); return; }
    say.textContent = text;
    say.classList.add('on');
    st.sayTimer = setTimeout(() => say.classList.remove('on'), Math.max(1200, ms));
  }
  function gag() {
    if (!st.shown || reducedMotion) return;
    const g = nextGag(rand, st.lastGag);
    st.lastGag = g.id;
    if (g.id === 'roll') stage.classList.toggle('flipped');
    else {
      stage.classList.remove(...GAGS.map((x) => `g-${x.id}`));
      void stage.offsetWidth;
      stage.classList.add(`g-${g.id}`);
      setTimeout(() => stage.classList.remove(`g-${g.id}`), g.ms + 50);
    }
    if (g.open) { st.eyesOpen = true; drawFace(); setTimeout(() => { st.eyesOpen = false; drawFace(); }, g.ms); }
    speak(g.say, g.ms);
    stage.dataset.gag = g.id; // 시험·점검용
    st.gagTimer = setTimeout(gag, GAG_GAP[0] + rand() * (GAG_GAP[1] - GAG_GAP[0]));
  }
  // 번인 줄이기: 1분마다 몇 px씩 옮김
  function drift() {
    if (reducedMotion) return;
    board.style.transform = `translate(${Math.round((rand() * 2 - 1) * 8)}px, ${Math.round((rand() * 2 - 1) * 8)}px)`;
  }

  function renderWeather(w) {
    if (!w || w.off) {
      weather.replaceChildren(el('div', { html: wxSvg('cloud') }), el('p', { class: 'ib-off' }, w?.reason ?? '날씨 정보가 없어요'));
      return;
    }
    weather.replaceChildren(
      el('div', { html: wxSvg(w.icon) }),
      el('div', {},
        el('div', { class: 'ib-wx-temp' }, `${Math.round(w.temp)}°`),
        el('div', { class: 'ib-wx-text' }, `${w.place} · ${w.sky}`),
        el('div', { class: 'ib-wx-sub' }, [w.min !== null && w.max !== null ? `${w.range && w.range !== '오늘' ? `${w.range} ` : ''}최저 ${Math.round(w.min)}° 최고 ${Math.round(w.max)}°` : null, w.pop !== null ? `비 ${w.pop}%` : null].filter(Boolean).join(' · '))));
    weather.setAttribute('aria-label', `날씨 ${w.place} ${w.sky} ${Math.round(w.temp)}도`);
  }
  function renderLists(b) {
    const today = dayOf(new Date());
    if (!b.important?.connected) {
      impList.replaceChildren(el('li', { class: 'ib-empty' }, b.note ?? '구글을 연결하면 오늘 일정이 보여요'));
    } else if (!b.important.items.length) {
      impList.replaceChildren(el('li', { class: 'ib-empty' }, '오늘은 등록된 중요한 일이 없어요. 푹 쉬어요!'));
    } else {
      impList.replaceChildren(...b.important.items.map((x) => el('li', {}, el('span', { class: `t${x.late ? ' late' : ''}` }, x.time), el('span', { class: 'x' }, x.title))));
    }
    todoSrc.textContent = b.todos?.label ? `· ${b.todos.label}` : '';
    if (!b.todos?.connected) {
      todoList.replaceChildren(el('li', { class: 'ib-empty' }, b.note ?? '할 일을 가져오는 곳을 연결하면 보여요'));
    } else if (!b.todos.items.length) {
      todoList.replaceChildren(el('li', { class: 'ib-empty' }, '남은 할 일이 없어요. 대단해요!'));
    } else {
      const items = b.todos.items.map((t) => el('li', {}, el('i', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'x' }, t.title), t.due ? el('span', { class: `d${t.late ? ' late' : ''}` }, dueText(t.due, today)) : null));
      if (b.todos.total > b.todos.items.length) items.push(el('li', { class: 'ib-empty' }, `그 밖에 ${b.todos.total - b.todos.items.length}개 더 있어요`));
      todoList.replaceChildren(...items);
    }
  }
  async function load() {
    try {
      const b = await api('GET', '/api/board');
      renderWeather(b.weather);
      renderLists(b);
    } catch {
      renderWeather({ off: true, reason: 'PC와 연결이 끊겨 날씨를 못 읽었어요' });
    }
  }

  function show() {
    if (st.shown) return;
    st.shown = true;
    st.eyesOpen = false;
    drawFace();
    showDate();
    load();
    clearInterval(st.refresh);
    // 1분마다: 날짜·번인 이동·지금 고른 캐릭터 그림 다시 보기(친구를 바꿨거나 그림이 늦게 불려도 맞게), 5분마다 자료 새로
    st.refresh = setInterval(() => { showDate(); drift(); drawFace(); if (new Date().getMinutes() % 5 === 0) load(); }, 60_000);
    setTimeout(drawFace, 1500); // 그림 얼굴이 막 불려 온 경우
    clearTimeout(st.gagTimer);
    st.gagTimer = setTimeout(gag, 6000);
  }
  function hide() {
    st.shown = false;
    clearInterval(st.refresh);
    clearTimeout(st.gagTimer);
    speak('');
    stage.classList.remove(...GAGS.map((x) => `g-${x.id}`));
  }
  showDate();
  return { show, hide, load, gag, redraw: drawFace, state: st };
}
