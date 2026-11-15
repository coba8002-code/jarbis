// 메인 화면(/jarvis)의 단축키 판 + 일정·할 일 바로 보기 + 회의 녹음(2026-11-15).
// 캐릭터 바로 아래 "바로 가기 줄": 회의(녹음 시작·끝) · 스트림덱(단축키 판 전체 화면) · 단축키 버튼들 · 고치기.
// jarvis.html은 mountDeck(hooks)만 부른다. 이 파일이 바로 가기 줄·타일·"일정·할 일" 화면·스트림덱 창을 끼워 넣는다
// (다른 작업자가 jarvis.html을 함께 고치고 있어 겹치는 곳을 줄이려고 따로 둠).
// 구글에 쓰는 일(일정 추가·할 일 추가·완료)은 확인 창에서 한 번 더 누른 뒤에만 보낸다.
import { iconSvg, colorCss } from '/static/deck-icons.js';
import * as V from '/static/voice-input.js';
import { createMeetingRecorder, fmtMs } from '/static/meeting-rec.js';

const $ = (s, root = document) => root.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else if (v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
};
const pad = (n) => String(n).padStart(2, '0');
const dateOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
function dayLabel(s) {
  const today = dateOf(new Date());
  const tomorrow = dateOf(new Date(Date.now() + 86_400_000));
  if (s === today) return '오늘';
  if (s === tomorrow) return '내일';
  const [y, m, d] = s.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(y, m - 1, d).getDay()]})`;
}
const hhmm = (iso) => String(iso ?? '').slice(11, 16);

const CSS = `
.deck-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 12px; margin-top: 8px; }
.deck-btn { --b-bg: var(--accent-soft); --b-fg: var(--accent); position: relative; aspect-ratio: 1 / 1; min-height: 96px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 8px; border: 1px solid var(--line); border-radius: 20px; background: var(--b-bg); color: var(--b-fg); cursor: pointer; transition: transform 120ms ease-out, opacity 150ms ease-out; -webkit-tap-highlight-color: transparent; }
.deck-btn svg { width: 32px; height: 32px; }
.deck-btn span { font-size: 14px; font-weight: 600; line-height: 1.25; text-align: center; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.deck-btn:active { transform: scale(.94); }
.deck-btn[aria-busy="true"] { opacity: .6; }
.deck-btn .pc-mark { position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .55; }
.deck-btn.done { animation: deck-pop 360ms ease-out; }
@keyframes deck-pop { 0% { transform: scale(1); } 40% { transform: scale(1.06); } 100% { transform: scale(1); } }
.deck-status { min-height: 20px; margin: 8px 0 0; font-size: 14px; color: var(--muted); }
.tile.tile-btn { font: inherit; text-align: left; cursor: pointer; color: inherit; }
.agenda-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 16px; }
.agenda-head h2 { font-size: 20px; }
.ag-day { margin: 16px 0 4px; font-size: 14px; font-weight: 600; color: var(--muted); }
.ag-list { list-style: none; margin: 0; padding: 0; }
.ag-item { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 0; border-top: 1px solid var(--line); }
.ag-item:first-child { border-top: 0; }
.ag-time { flex: 0 0 96px; font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; }
.ag-title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ag-sub { display: block; font-size: 12px; color: var(--muted); }
.ag-due { font-size: 12px; color: var(--muted); }
.ag-due.late { color: var(--bad); font-weight: 600; }
.ag-done { flex: 0 0 44px; width: 44px; height: 44px; border: 2px solid var(--line); border-radius: 50%; background: var(--surface); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--ok); }
.ag-done svg { opacity: 0; width: 22px; height: 22px; transition: opacity 150ms ease-out; }
@media (hover: hover) { .ag-done:hover svg { opacity: .5; } }
.ag-form { display: grid; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.ag-form label { font-size: 14px; font-weight: 500; }
.ag-form input { width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--text); font: inherit; }
.ag-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ag-row > div { display: grid; gap: 4px; }
.ag-err { min-height: 20px; font-size: 14px; color: var(--bad); margin: 0; }
.ag-acts { display: flex; justify-content: flex-end; gap: 8px; }
.ag-empty { padding: 16px 0; text-align: center; color: var(--muted); font-size: 14px; }
.ag-empty strong { display: block; color: var(--text); font-size: 16px; font-weight: 600; margin-bottom: 4px; }
@media (max-width: 480px) { .ag-row { grid-template-columns: 1fr 1fr; } .ag-row > div:first-child { grid-column: 1 / -1; } .ag-time { flex-basis: 72px; } }
/* 캐릭터 아래 바로 가기 줄(옆으로 넘김). 앞뒤 빈 칸(::before·::after margin:auto)으로 넓은 화면에서는 가운데 */
.dock { display: flex; gap: 12px; overflow-x: auto; padding: 16px 8px 4px; margin: 0 -16px; scroll-snap-type: x proximity; scrollbar-width: none; }
.dock::-webkit-scrollbar { display: none; }
.dock::before, .dock::after { content: ""; margin: auto; }
.dock-btn { --b-bg: var(--surface); --b-fg: var(--text); position: relative; flex: 0 0 68px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--text); font: inherit; text-decoration: none; cursor: pointer; scroll-snap-align: start; -webkit-tap-highlight-color: transparent; }
.dock-ico { position: relative; width: 56px; height: 56px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: var(--b-bg); color: var(--b-fg); border: 1px solid var(--line); box-shadow: var(--shadow); transition: transform 120ms ease-out; }
.dock-ico svg { width: 28px; height: 28px; }
.dock-btn:active .dock-ico { transform: scale(.92); }
.dock-btn.done .dock-ico { animation: deck-pop 360ms ease-out; }
.dock-btn[aria-busy="true"] { opacity: .6; }
.dock-lbl { max-width: 72px; font-size: 12px; font-weight: 600; line-height: 1.3; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dock-btn .pc-mark { position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 50%; background: var(--b-fg); opacity: .55; }
.dock-sep { flex: 0 0 1px; align-self: stretch; margin: 8px 0 26px; background: var(--line); }
.dock-meet[aria-pressed="true"] .dock-ico, .deck-btn.meet[aria-pressed="true"] { background: var(--bad); color: #fff; border-color: transparent; }
.dock-meet[aria-pressed="true"] .dock-ico::after { content: ""; position: absolute; inset: -5px; border: 2px solid var(--bad); border-radius: 22px; animation: meet-pulse 1.6s ease-out infinite; }
@keyframes meet-pulse { 0% { opacity: .8; transform: scale(.95); } 100% { opacity: 0; transform: scale(1.15); } }
.meet-line { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 8px 0 0; font-size: 14px; color: var(--text); text-align: center; overflow-wrap: anywhere; }
.meet-line b { color: var(--bad); font-variant-numeric: tabular-nums; }
.meet-line i { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--bad); }
.hero .deck-status { text-align: center; }
/* AI 고르기 창 */
dialog#aipick { width: min(520px, calc(100vw - 32px)); max-height: 86vh; padding: 0; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); color: var(--text); }
dialog#aipick::backdrop { background: rgba(20, 12, 4, .4); }
.ai-head { position: sticky; top: 0; display: flex; align-items: center; gap: 8px; padding: 16px 16px 8px 24px; background: var(--surface); }
.ai-head h2 { flex: 1; font-size: 18px; }
.ai-body { padding: 0 16px 16px; }
.ai-note { margin: 0 8px 8px; font-size: 14px; color: var(--muted); }
.ai-opt { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; margin: 0 0 8px; padding: 8px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.ai-opt[aria-checked="true"] { border: 2px solid var(--accent); padding: 7px 15px; background: var(--accent-soft); }
.ai-opt[aria-disabled="true"] { opacity: .55; cursor: default; }
.ai-opt b { display: block; font-weight: 600; }
.ai-opt small { display: block; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.ai-opt .ai-tag { margin-left: auto; flex: 0 0 auto; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); font-size: 12px; color: var(--muted); }
.ai-opt .ai-tag.out { color: var(--warn); border-color: currentColor; }
.ai-sub { margin: 16px 8px 8px; font-size: 14px; font-weight: 600; color: var(--muted); }
/* 스트림덱: 단축키 판을 화면 가득(토스 기기를 버튼 판으로 쓰기) */
dialog#deckpad { width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh; margin: 0; padding: 16px 16px 24px; border: 0; background: var(--canvas); color: var(--text); }
dialog#deckpad::backdrop { background: var(--canvas); }
.pad-head { display: flex; align-items: center; gap: 8px; max-width: 1200px; margin: 0 auto; }
.pad-head h2 { flex: 1; font-size: 20px; }
#deckpad .deck-grid { max-width: 1200px; margin: 16px auto 0; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 16px; }
#deckpad .deck-btn svg { width: 40px; height: 40px; }
#deckpad .deck-btn span { font-size: 16px; }
#deckpad .deck-status { max-width: 1200px; margin: 16px auto 0; }
@media (prefers-reduced-motion: reduce) { .deck-btn, .deck-btn.done, .dock-btn.done .dock-ico { transition: opacity 150ms linear; animation: none; } .deck-btn:active, .dock-btn:active .dock-ico { transform: none; } .dock-meet[aria-pressed="true"] .dock-ico::after { animation: none; opacity: .6; } }
${colorCss('.deck-btn')}
${colorCss('.dock-btn')}
`;

// hooks: { api, token, ask(text), toggleVoice(), stop(), playBriefing(), showCheck(bool), openPicker(), confirm({title, body, ok, primary}), motion(name),
//          beforeMeeting() → false면 시작 안 함, afterMeeting(), note(text), refreshTiles(),
//          setAi({ provider, model, label }) — 메인 화면 대화에 쓸 AI, app — window.JarvisApp(기기 앱일 때) }
export function mountDeck(hooks) {
  const { api } = hooks;
  document.head.append(el('style', {}, CSS));
  const state = { buttons: [], google: null, events: [], tasks: [], loadedAt: 0 };

  // ---- 요약 타일 두 개 더(누르면 일정·할 일 화면) ----
  const tiles = $('.tiles');
  const nEvents = el('span', { class: 'tile-num', id: 'n-events' }, '–');
  const nTasks = el('span', { class: 'tile-num', id: 'n-tasks' }, '–');
  tiles?.append(
    el('button', { type: 'button', class: 'tile tile-btn', id: 'tile-events', onclick: () => showAgenda('calendar') }, el('span', { class: 'tile-label' }, '오늘 일정 ›'), nEvents),
    el('button', { type: 'button', class: 'tile tile-btn', id: 'tile-tasks', onclick: () => showAgenda('tasks') }, el('span', { class: 'tile-label' }, '남은 할 일 ›'), nTasks),
  );

  // ---- 캐릭터 아래 바로 가기 줄: 회의 · 스트림덱 · 단축키 버튼들 · 고치기 ----
  const dock = el('div', { class: 'dock', id: 'dock', role: 'group', 'aria-label': '바로 가기' });
  const meetLine = el('p', { class: 'meet-line', id: 'meet-line', role: 'status', hidden: true });
  const deckStatus = el('p', { class: 'deck-status', id: 'deck-status', role: 'status', 'aria-live': 'polite' });
  ($('#state') ?? $('.hero') ?? $('#talk')).after(dock, meetLine, deckStatus);
  // ---- 스트림덱: 단축키 판 전체 화면 ----
  const grid = el('div', { class: 'deck-grid', id: 'deck-grid', role: 'group', 'aria-label': '단축키 버튼' });
  const padStatus = el('p', { class: 'deck-status', role: 'status', 'aria-live': 'polite' });
  const deckpad = el('dialog', { id: 'deckpad', 'aria-labelledby': 'deckpad-h' },
    el('div', { class: 'pad-head' }, el('h2', { id: 'deckpad-h' }, '스트림덱'), el('a', { class: 'link', href: '/#shortcuts' }, '버튼 고치기 ›'), el('button', { type: 'button', class: 'btn btn-secondary', id: 'deckpad-close', onclick: () => deckpad.close() }, '닫기')),
    grid, padStatus);
  document.body.append(deckpad);
  const setStatus = (msg) => { deckStatus.textContent = msg; padStatus.textContent = msg; };
  function openPad() { renderButtons(); setStatus(''); deckpad.showModal(); $('#deckpad-close').focus(); }

  // ---- AI 고르기(Claude · Codex(OpenAI) · Grok · 로컬(Ollama 모델) · Llama(llama.cpp)) ----
  // 고른 것은 이 기기 브라우저에만 저장(jarvis.ai). 외부 AI에는 질문 글만 간다(기억·주변 대화·일정·스킬 자료는 서버가 빼고 보냄).
  const AI_KEY = 'jarvis.ai';
  const AI_LABELS = { claude: 'Claude', openai: 'Codex(OpenAI)', grok: 'Grok', ollama: '로컬(Ollama)', llama: 'Llama(llama.cpp)' };
  const labelOf = (p) => p.label ?? AI_LABELS[p.name] ?? p.name;
  const aiList = el('div', { class: 'ai-body', id: 'ai-list' });
  const aipick = el('dialog', { id: 'aipick', 'aria-labelledby': 'aipick-h' },
    el('div', { class: 'ai-head' }, el('h2', { id: 'aipick-h' }, '대화할 AI 고르기'), el('button', { type: 'button', class: 'btn btn-secondary', id: 'aipick-close', onclick: () => aipick.close() }, '닫기')),
    aiList);
  document.body.append(aipick);
  const ai = { provider: null, model: null, label: '' };
  function savedAi() { try { return JSON.parse(localStorage.getItem(AI_KEY) ?? 'null'); } catch { return null; } }
  function rememberAi(v) { try { localStorage.setItem(AI_KEY, JSON.stringify(v)); } catch { /* 저장 못 해도 이번에는 씀 */ } }
  function applyAi(v, { announce = true } = {}) {
    Object.assign(ai, v);
    hooks.setAi?.({ ...ai });
    const btn = $('#dock-ai .dock-lbl');
    if (btn) btn.textContent = shortAi();
    if (announce) setStatus(`이제 ${ai.label}${ai.model && ai.provider === 'ollama' ? `(${ai.model})` : ''}(으)로 대화해요.`);
  }
  const shortAi = () => (ai.provider === 'ollama' ? '로컬' : ai.provider === 'openai' ? 'Codex' : ai.provider === 'llama' ? 'Llama' : ai.label || 'AI');
  // 처음: 저장된 것이 쓸 수 있으면 그것, 아니면 로컬(Ollama)
  async function initAi() {
    let list = [];
    try { list = await api('GET', '/api/providers'); } catch { return; }
    const want = savedAi();
    const pick = (want && list.find((p) => p.name === want.provider && p.ready !== false)) ? want
      : (() => { const p = list.find((x) => x.name === 'ollama' && !x.remote && x.ready !== false) ?? list.find((x) => !x.remote && x.ready !== false); return p ? { provider: p.name, model: null, label: labelOf(p) } : null; })();
    if (pick) applyAi({ provider: pick.provider, model: pick.model ?? null, label: pick.label ?? labelOf(list.find((x) => x.name === pick.provider) ?? { name: pick.provider }) }, { announce: false });
  }
  async function openAiPick() {
    aiList.replaceChildren(el('p', { class: 'ai-note' }, '불러오는 중…'));
    aipick.showModal();
    $('#aipick-close').focus();
    let list = []; let models = [];
    try { list = await api('GET', '/api/providers'); } catch (e) { aiList.replaceChildren(el('p', { class: 'ai-note' }, `AI 목록을 읽지 못했어요. ${e.message}`)); return; }
    try { models = await api('GET', '/api/providers/ollama/models'); } catch { models = []; }
    const order = ['claude', 'openai', 'llama', 'grok'];
    const opt = ({ provider, model = null, title, sub, tag, out, ready = true, reason = '' }) => {
      const on = ai.provider === provider && (provider !== 'ollama' || (ai.model ?? null) === model);
      const b = el('button', { type: 'button', class: 'ai-opt', role: 'radio', 'aria-checked': String(on), 'aria-disabled': String(!ready) },
        el('span', {}, el('b', {}, title), el('small', {}, ready ? sub : `쓸 수 없음 · ${reason}`)), el('span', { class: `ai-tag${out ? ' out' : ''}` }, tag));
      b.addEventListener('click', async () => {
        if (!ready) { setStatus(`${title}: ${reason}. PC의 .env.local을 확인해 주세요.`); return; }
        if (out && !(ai.provider === provider)) {
          const yes = await hooks.confirm({ title: `${title}(으)로 대화할까요?`, body: `질문 글이 ${title} 서버로 가요(인터넷, 사용량만큼 요금이 들 수 있어요). 기억·주변 대화·일정·회의는 보내지 않아요.`, ok: '이 AI로 대화', primary: true });
          if (!yes) return;
        }
        const v = { provider, model, label: title };
        rememberAi(v);
        applyAi(v);
        aipick.close();
        hooks.motion?.('nod');
      });
      return b;
    };
    const items = [el('p', { class: 'ai-note' }, '이 기기 안 AI는 대화 내용이 PC 밖으로 나가지 않아요. 외부 AI는 질문 글만 보내요.')];
    items.push(el('h3', { class: 'ai-sub' }, '이 PC 안 AI(로컬)'));
    const ol = list.find((p) => p.name === 'ollama');
    if (ol) {
      items.push(opt({ provider: 'ollama', model: null, title: '로컬(Ollama)', sub: `기본 모델 ${ol.model ?? '설정 안 됨'}`, tag: '이 PC', out: ol.remote, ready: ol.ready !== false, reason: ol.reason }));
      // 글 대화를 못 하는 임베딩 모델(bge·embedding)은 뺀다
      for (const m of models.filter((x) => x.name !== ol.model && !/embed|bge|bert/i.test(`${x.name} ${x.family}`))) {
        items.push(opt({ provider: 'ollama', model: m.name, title: `로컬 · ${m.name}`, sub: `${m.family || 'Ollama 모델'}${m.size ? ` · ${(m.size / 1e9).toFixed(1)}GB` : ''}${/llama/i.test(m.name) ? ' · 라마' : ''}`, tag: '이 PC', out: ol.remote, ready: ol.ready !== false || Boolean(m.name), reason: ol.reason }));
      }
    }
    const ll = list.find((p) => p.name === 'llama');
    if (ll) items.push(opt({ provider: 'llama', title: 'Llama(llama.cpp)', sub: `${ll.baseUrl} · llama-server`, tag: ll.remote ? '외부' : '이 PC', out: ll.remote, ready: ll.ready !== false, reason: ll.reason }));
    items.push(el('h3', { class: 'ai-sub' }, '인터넷 AI(외부)'));
    for (const name of order.filter((n) => n !== 'llama')) {
      const p = list.find((x) => x.name === name);
      if (!p) continue;
      items.push(opt({ provider: name, title: labelOf(p), sub: `모델 ${p.model ?? '설정 안 됨'}`, tag: '외부', out: p.remote, ready: p.ready !== false, reason: p.reason }));
    }
    aiList.replaceChildren(...items);
  }

  // ---- 회의 녹음(이 기기 마이크 → PC에서 받아 적고 원음은 PC에만) ----
  let lastSaid = '';
  const rec = createMeetingRecorder({ api, token: hooks.token, V, on: {
    tick: (ms) => { meetLine.replaceChildren(el('i', { 'aria-hidden': 'true' }), el('b', {}, `회의 녹음 중 ${fmtMs(ms)}`), ...(lastSaid ? [el('span', {}, `· ${lastSaid.length > 40 ? `${lastSaid.slice(0, 38)}…` : lastSaid}`)] : [])); },
    segment: (seg) => { lastSaid = seg.text; },
    status: (t) => setStatus(t),
    state: (on) => { meetLine.hidden = !on; if (!on) lastSaid = ''; renderMeetButtons(); },
  } });
  function renderMeetButtons() {
    const on = rec.active();
    for (const b of document.querySelectorAll('[data-meet]')) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? '회의 녹음 끝내기' : '회의 녹음 시작');
      const lbl = b.querySelector('span');
      if (lbl) lbl.textContent = on ? '회의 끝내기' : '회의';
    }
  }
  // 회의 의견·결론 정리: 짧게 알리고, 전체(의견마다 시간 단추)는 설정 → 회의에서 본다
  async function summarize(id) {
    setStatus('회의 의견·결론을 정리하는 중… 긴 회의는 몇 분 걸려요.');
    try {
      const { summary: s } = await api('POST', `/api/meetings/${id}/summary`);
      const counts = [s.opinions.length && `의견 ${s.opinions.length}개`, s.decisions.length && `정한 것 ${s.decisions.length}개`, s.todos.length && `할 일 ${s.todos.length}개`].filter(Boolean).join(' · ');
      const msg = `회의 정리: ${s.summary || '뚜렷한 결론을 찾지 못했어요.'}${counts ? ` (${counts})` : ''} 자세한 건 설정 → 회의에서 볼 수 있어요.`;
      setStatus(msg);
      hooks.note?.(msg);
    } catch (e) {
      setStatus(`회의를 정리하지 못했어요. ${e.message} 설정 → 회의에서 다시 누를 수 있어요.`);
    }
  }
  async function toggleMeeting() {
    if (rec.active()) {
      try {
        const r = await rec.stop();
        if (r) {
          const msg = r.empty ? '녹음된 소리가 없어 회의를 만들지 않았어요.' : `회의록을 저장했어요: ${fmtMs(r.meeting.duration_ms)}, 구간 ${r.segments.length}개${r.failed ? `, 저장 못 한 조각 ${r.failed}개` : ''}. 설정 → 회의에서 다시 듣고 찾을 수 있어요.`;
          setStatus(msg);
          hooks.note?.(msg);
          if (!r.empty) hooks.motion?.('cheer');
          // 받아 적은 말이 있으면 이어서 의견·결론 정리(이 PC 안 AI만, 클라우드로 보내지 않음)
          if (!r.empty && r.segments.length) summarize(r.meeting.id);
        }
      } catch (e) { setStatus(`회의를 마무리하지 못했어요. ${e.message}`); }
      finally { hooks.afterMeeting?.(); hooks.refreshTiles?.(); }
      return;
    }
    const yes = await hooks.confirm({ title: '회의를 녹음할까요?', body: '이 기기 마이크로 녹음해 JARVIS PC에서 받아 적고, 원음은 PC에만 저장해요. 함께 있는 사람에게 녹음한다고 알려 주세요. 녹음하는 동안 말하기·부르면 대답하기는 멈춰요.', ok: '녹음 시작', primary: true });
    if (!yes) return;
    if (hooks.beforeMeeting?.() === false) return;
    try {
      await rec.start();
      hooks.motion?.('hop');
    } catch (e) {
      setStatus(`회의 녹음을 시작하지 못했어요. ${e.message}`);
      hooks.afterMeeting?.();
    }
    renderMeetButtons();
  }
  window.addEventListener('beforeunload', (e) => { if (rec.active()) { e.preventDefault(); e.returnValue = ''; } });

  // ---- 일정·할 일 화면 ----
  const evList = el('div', { id: 'ag-events' });
  const tkList = el('ul', { class: 'ag-list', id: 'ag-tasks' });
  const evForm = eventForm();
  const tkForm = taskForm();
  const page = el('div', { class: 'page', id: 'agenda', hidden: true },
    el('div', { class: 'agenda-head' }, el('h2', { id: 'agenda-h' }, '일정·할 일'), el('button', { type: 'button', class: 'btn btn-secondary', id: 'agenda-back', onclick: () => showAgenda(null) }, '대화로 돌아가기')),
    el('section', { class: 'card', id: 'ag-cal-card', 'aria-labelledby': 'ag-cal-h' },
      el('div', { class: 'card-head' }, el('h2', { id: 'ag-cal-h' }, '일정 (오늘부터 7일)'), el('button', { type: 'button', class: 'btn btn-secondary', id: 'ev-open', 'aria-expanded': 'false', onclick: () => toggleForm(evForm, '#ev-open', '#ev-title') }, '일정 추가')),
      evList, evForm),
    el('section', { class: 'card', id: 'ag-task-card', 'aria-labelledby': 'ag-task-h' },
      el('div', { class: 'card-head' }, el('h2', { id: 'ag-task-h' }, '할 일'), el('button', { type: 'button', class: 'btn btn-secondary', id: 'tk-open', 'aria-expanded': 'false', onclick: () => toggleForm(tkForm, '#tk-open', '#tk-title') }, '할 일 추가')),
      tkList, tkForm),
    el('p', { class: 'card-note' }, '구글 캘린더(기본 캘린더)와 구글 Tasks(기본 목록)를 보여 줘요. 일정·할 일 글은 구글과 JARVIS PC 사이에서만 오가요.'));
  $('main').append(page);

  function toggleForm(form, btnSel, focusSel) {
    const open = form.hidden;
    form.hidden = !open;
    $(btnSel).setAttribute('aria-expanded', String(open));
    if (open) $(focusSel, form).focus();
  }

  function showAgenda(section) {
    const show = Boolean(section);
    if (show) hooks.showCheck(false);
    page.hidden = !show;
    $('#talk').hidden = show;
    $('#bar').hidden = show;
    if (show) {
      loadAgenda(true);
      const target = section === 'tasks' ? $('#ag-task-card') : $('#ag-cal-card');
      requestAnimationFrame(() => { target.scrollIntoView({ block: 'start' }); $('#agenda-h').focus?.(); });
    } else {
      $('#tile-events')?.focus();
    }
  }
  $('#agenda-h', page).tabIndex = -1;

  // ---- 버튼 그리기·누르기 ----
  function renderButtons() {
    // 스트림덱(전체 화면): 회의 버튼 + 단축키 버튼들
    const meetBig = el('button', { type: 'button', class: 'deck-btn meet', 'data-meet': '', 'data-color': 'pink', 'aria-pressed': 'false', html: iconSvg('mic', 32) });
    meetBig.append(el('span', { 'aria-hidden': 'true' }, '회의'));
    meetBig.addEventListener('click', toggleMeeting);
    grid.replaceChildren(meetBig, ...state.buttons.map((b) => {
      const btn = el('button', { type: 'button', class: 'deck-btn', 'data-color': b.color, 'data-id': b.id, 'aria-label': b.label, html: iconSvg(b.icon, 32) });
      btn.append(el('span', { 'aria-hidden': 'true' }, b.label));
      if (b.action.type.startsWith('pc-')) btn.append(el('i', { class: 'pc-mark', title: 'PC에서 실행' }));
      btn.addEventListener('click', () => press(b, btn));
      return btn;
    }));
    // 캐릭터 아래 바로 가기 줄
    const dockBtn = (attrs, icon, label, onclick, tag = 'button') => {
      const b = el(tag, { class: 'dock-btn', ...(tag === 'button' ? { type: 'button' } : {}), ...attrs }, el('i', { class: 'dock-ico', html: iconSvg(icon, 28) }), el('span', { class: 'dock-lbl', 'aria-hidden': 'true' }, label));
      if (onclick) b.addEventListener('click', onclick);
      return b;
    };
    const items = [
      dockBtn({ class: 'dock-btn dock-meet', 'data-meet': '', 'aria-pressed': 'false', 'aria-label': '회의 녹음 시작', 'data-color': 'pink' }, 'mic', '회의', toggleMeeting),
      dockBtn({ id: 'dock-pad', 'aria-label': '스트림덱(단축키 판 전체 화면) 열기', 'data-color': 'orange' }, 'app', '스트림덱', openPad),
      dockBtn({ id: 'dock-ai', 'aria-label': '대화할 AI 고르기', 'data-color': 'purple' }, 'chat', shortAi(), openAiPick),
      // 기기 앱(JARVIS 앱)일 때만: 연결할 PC 서버 바꾸기(앱의 저장된 서버 목록 화면)
      hooks.app?.openSetup ? dockBtn({ id: 'dock-server', 'aria-label': '연결할 서버 바꾸기', 'data-color': 'teal' }, 'home', '서버', () => hooks.app.openSetup()) : null,
      el('span', { class: 'dock-sep', 'aria-hidden': 'true' }),
      ...state.buttons.map((b) => {
        const btn = dockBtn({ 'data-color': b.color, 'data-id': b.id, 'aria-label': b.label }, b.icon, b.label, null);
        if (b.action.type.startsWith('pc-')) btn.querySelector('.dock-ico').append(el('i', { class: 'pc-mark', title: 'PC에서 실행' }));
        btn.addEventListener('click', () => press(b, btn));
        return btn;
      }),
      dockBtn({ href: '/#shortcuts', 'aria-label': '단축키 버튼 고치기' }, 'gear', '고치기', null, 'a'),
    ];
    dock.replaceChildren(...items.filter(Boolean));
    renderMeetButtons();
  }
  async function press(b, btn) {
    if (btn.getAttribute('aria-busy') === 'true') return;
    const a = b.action;
    setStatus('');
    const ok = (msg) => { btn.classList.remove('done'); void btn.offsetWidth; btn.classList.add('done'); if (msg) setStatus(msg); };
    // 화면을 바꾸는 버튼은 스트림덱 창을 먼저 닫는다(물어보기·브리핑 결과가 대화 화면에 보이게)
    if (deckpad.open && a.type !== 'stop' && a.type !== 'voice' && !a.type.startsWith('pc-')) deckpad.close();
    try {
      if (a.type === 'ask') { hooks.ask(a.text); ok(); return; }
      if (a.type === 'voice') { hooks.toggleVoice(); ok(); return; }
      if (a.type === 'stop') { hooks.stop(); ok('멈췄어요'); return; }
      if (a.type === 'briefing') { hooks.playBriefing(); ok(); return; }
      if (a.type === 'open') {
        if (a.view === 'calendar' || a.view === 'tasks') return showAgenda(a.view);
        if (a.view === 'check') return hooks.showCheck(true);
        if (a.view === 'settings') { location.href = '/'; return; }
        if (a.view === 'pals') return hooks.openPicker();
        if (a.view === 'briefing') { $('#brief-card')?.scrollIntoView({ block: 'center' }); ok(); return; }
      }
      btn.setAttribute('aria-busy', 'true');
      setStatus(`${b.label}: PC에서 하는 중…`);
      await api('POST', `/api/shortcuts/${b.id}/press`, {});
      ok(`${b.label}: PC에서 했어요`);
      hooks.motion?.('bounce');
    } catch (e) {
      setStatus(`${b.label}: 하지 못했어요. ${e.message}`);
    } finally {
      btn.removeAttribute('aria-busy');
    }
  }
  async function loadButtons() {
    try {
      const r = await api('GET', '/api/shortcuts');
      // 바뀐 것이 없으면 다시 그리지 않는다(바로 가기 줄을 넘겨 둔 위치 유지)
      if (JSON.stringify(r.buttons) === JSON.stringify(state.buttons) && dock.childElementCount) return;
      state.buttons = r.buttons;
      renderButtons();
    } catch { /* 버튼을 못 읽으면 지난 것을 그대로 둠 */ }
  }

  // ---- 일정·할 일 ----
  function notConnected(box, what) {
    const st = state.google;
    const msg = !st?.configured ? 'PC의 .env.local에 구글 연결 정보를 넣어야 해요.' : '설정에서 구글 계정을 연결하면 여기에 보여요.';
    box.replaceChildren(el('div', { class: 'ag-empty' }, el('strong', {}, `${what}을(를) 아직 볼 수 없어요`), msg, ' ', el('a', { class: 'link', href: '/#shortcuts' }, '연결하러 가기 ›')));
  }
  function renderEvents() {
    if (!state.google?.connected) return notConnected(evList, '일정');
    if (!state.events.length) { evList.replaceChildren(el('div', { class: 'ag-empty' }, el('strong', {}, '7일 안에 일정이 없어요'), '위의 "일정 추가"로 새 일정을 넣을 수 있어요.')); return; }
    const groups = new Map();
    for (const e of state.events) {
      const day = String(e.start ?? '').slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(e);
    }
    const out = [];
    for (const [day, list] of groups) {
      out.push(el('h3', { class: 'ag-day' }, dayLabel(day)));
      out.push(el('ul', { class: 'ag-list' }, list.map((e) => el('li', { class: 'ag-item' },
        el('span', { class: 'ag-time' }, e.allDay ? '하루 종일' : `${hhmm(e.start)}~${hhmm(e.end)}`),
        el('span', { class: 'ag-title' }, e.title, e.location ? el('span', { class: 'ag-sub' }, e.location) : null)))));
    }
    evList.replaceChildren(...out);
  }
  function renderTasks() {
    if (!state.google?.connected) { tkList.replaceChildren(el('li', {}, notConnectedNode('할 일'))); return; }
    if (!state.tasks.length) { tkList.replaceChildren(el('li', { class: 'ag-empty' }, el('strong', {}, '남은 할 일이 없어요'), '"할 일 추가"로 새로 넣을 수 있어요.')); return; }
    const today = dateOf(new Date());
    tkList.replaceChildren(...state.tasks.map((t) => {
      const late = t.due && t.due < today;
      const due = t.due ? el('span', { class: `ag-due${late ? ' late' : ''}` }, late ? `기한 지남 · ${dayLabel(t.due)}` : dayLabel(t.due)) : null;
      return el('li', { class: 'ag-item' },
        el('button', { type: 'button', class: 'ag-done', 'aria-label': `"${t.title}" 완료로 표시`, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>', onclick: () => completeTask(t) }),
        el('span', { class: 'ag-title' }, t.title, due ? el('span', { class: 'ag-sub' }, due) : null));
    }));
  }
  function notConnectedNode(what) {
    const box = el('div');
    notConnected(box, what);
    return box.firstChild;
  }
  function renderTiles() {
    if (!state.google?.connected) { nEvents.textContent = '–'; nTasks.textContent = '–'; return; }
    const today = dateOf(new Date());
    nEvents.textContent = String(state.events.filter((e) => String(e.start ?? '').slice(0, 10) <= today).length);
    nTasks.textContent = String(state.tasks.length);
  }
  async function loadAgenda(force = false) {
    if (!force && Date.now() - state.loadedAt < 55_000) return;
    state.loadedAt = Date.now();
    try { state.google = await api('GET', '/api/google'); } catch { state.google = null; }
    if (state.google?.connected) {
      try { state.events = await api('GET', '/api/google/events?days=7'); } catch (e) { evList.replaceChildren(el('p', { class: 'ag-err' }, `일정을 읽지 못했어요. ${e.message}`)); state.events = []; }
      try { state.tasks = await api('GET', '/api/google/tasks'); } catch (e) { state.tasks = []; tkList.replaceChildren(el('li', { class: 'ag-err' }, `할 일을 읽지 못했어요. ${e.message}`)); }
    }
    if (!evList.querySelector('.ag-err')) renderEvents();
    if (!tkList.querySelector('.ag-err')) renderTasks();
    renderTiles();
    $('#ev-open').hidden = !state.google?.connected;
    $('#tk-open').hidden = !state.google?.connected;
  }

  async function completeTask(t) {
    const yes = await hooks.confirm({ title: '할 일을 완료로 표시할까요?', body: `구글 Tasks의 "${t.title}"을(를) 완료로 바꿔요.`, ok: '완료로 표시', primary: true });
    if (!yes) return;
    try {
      await api('POST', `/api/google/tasks/${encodeURIComponent(t.id)}/complete`, { confirm: true });
      state.tasks = state.tasks.filter((x) => x.id !== t.id);
      renderTasks(); renderTiles();
      hooks.motion?.('cheer');
      setStatus('');
    } catch (e) { tkList.prepend(el('li', { class: 'ag-err' }, `완료로 바꾸지 못했어요. ${e.message}`)); }
  }

  function field(id, label, attrs = {}) {
    return el('div', {}, el('label', { for: id }, label), el('input', { id, ...attrs }));
  }
  function eventForm() {
    const f = el('form', { class: 'ag-form', id: 'ev-form', hidden: true, novalidate: true },
      field('ev-title', '제목', { maxlength: '200', autocomplete: 'off', 'aria-describedby': 'ev-err' }),
      el('div', { class: 'ag-row' }, field('ev-date', '날짜', { type: 'date' }), field('ev-start', '시작(선택)', { type: 'time' }), field('ev-end', '끝(선택)', { type: 'time' })),
      el('p', { class: 'ag-err', id: 'ev-err', role: 'alert' }),
      el('div', { class: 'ag-acts' }, el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => toggleForm(f, '#ev-open', '#ev-title') }, '취소'), el('button', { type: 'submit', class: 'btn btn-primary' }, '캘린더에 추가')));
    const title = $('#ev-title', f);
    title.addEventListener('blur', () => { if (!title.value.trim()) $('#ev-err', f).textContent = '제목을 적어 주세요.'; });
    title.addEventListener('input', () => { $('#ev-err', f).textContent = ''; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { title: title.value.trim(), date: $('#ev-date', f).value, start: $('#ev-start', f).value, end: $('#ev-end', f).value };
      if (!body.title) { $('#ev-err', f).textContent = '제목을 적어 주세요.'; title.focus(); return; }
      if (!body.date) { $('#ev-err', f).textContent = '날짜를 골라 주세요.'; $('#ev-date', f).focus(); return; }
      const when = `${dayLabel(body.date)}${body.start ? ` ${body.start}${body.end ? `~${body.end}` : ''}` : ' 하루 종일'}`;
      if (!await hooks.confirm({ title: '구글 캘린더에 추가할까요?', body: `"${body.title}" · ${when}`, ok: '캘린더에 추가', primary: true })) return;
      try {
        await api('POST', '/api/google/events', { ...body, confirm: true });
        f.reset(); $('#ev-date', f).value = dateOf(new Date());
        toggleForm(f, '#ev-open', '#ev-title');
        hooks.motion?.('cheer');
        await loadAgenda(true);
      } catch (err) { $('#ev-err', f).textContent = `추가하지 못했어요. ${err.message}`; }
    });
    $('#ev-date', f).value = dateOf(new Date());
    return f;
  }
  function taskForm() {
    const f = el('form', { class: 'ag-form', id: 'tk-form', hidden: true, novalidate: true },
      field('tk-title', '할 일', { maxlength: '200', autocomplete: 'off', 'aria-describedby': 'tk-err' }),
      el('div', { class: 'ag-row' }, field('tk-due', '날짜(선택)', { type: 'date' })),
      el('p', { class: 'ag-err', id: 'tk-err', role: 'alert' }),
      el('div', { class: 'ag-acts' }, el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => toggleForm(f, '#tk-open', '#tk-title') }, '취소'), el('button', { type: 'submit', class: 'btn btn-primary' }, '할 일 추가')));
    const title = $('#tk-title', f);
    title.addEventListener('blur', () => { if (!title.value.trim()) $('#tk-err', f).textContent = '할 일을 적어 주세요.'; });
    title.addEventListener('input', () => { $('#tk-err', f).textContent = ''; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { title: title.value.trim(), due: $('#tk-due', f).value };
      if (!body.title) { $('#tk-err', f).textContent = '할 일을 적어 주세요.'; title.focus(); return; }
      if (!await hooks.confirm({ title: '구글 Tasks에 추가할까요?', body: `"${body.title}"${body.due ? ` · ${dayLabel(body.due)}까지` : ''}`, ok: '할 일 추가', primary: true })) return;
      try {
        await api('POST', '/api/google/tasks', { ...body, confirm: true });
        f.reset();
        toggleForm(f, '#tk-open', '#tk-title');
        hooks.motion?.('cheer');
        await loadAgenda(true);
      } catch (err) { $('#tk-err', f).textContent = `추가하지 못했어요. ${err.message}`; }
    });
    return f;
  }

  loadButtons();
  loadAgenda(true);
  initAi();
  // 1분마다(화면이 보이고 쉬는 중이 아닐 때) 다시 읽는다. 서버도 1분 동안은 구글에 다시 묻지 않는다.
  setInterval(() => { if (!document.hidden && !document.body.classList.contains('asleep')) { loadAgenda(); loadButtons(); } }, 60_000);
  return {
    showAgenda,
    isOpen: () => !page.hidden,
    meetingActive: () => rec.active(),
    // 쓰는 중(일정 화면·스트림덱 창·회의 녹음)이면 쉬는 화면으로 가지 않게
    busy: () => !page.hidden || deckpad.open || aipick.open || rec.active(),
    savedAi,
    reload: () => { loadButtons(); loadAgenda(true); },
  };
}
