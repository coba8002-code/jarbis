// 설정 화면(/)의 "단축키·구글" 탭(2026-11-15). index.html은 탭 자리와 이 파일만 넣는다.
// - 구글 캘린더·Tasks 연결: 이 PC 화면에서 "구글 연결하기" → 새 창에서 사용자가 직접 로그인 → 돌아오면 연결됨.
// - 단축키 버튼 고치기: 추가·고치기·지우기·순서 바꾸기. PC 조작 버튼은 이 PC 화면에서만 만들고 고칠 수 있다(서버도 막음).
import { iconSvg, colorCss, ICON_NAMES, COLOR_NAMES, ACTION_NAMES, VIEW_NAMES } from '/static/deck-icons.js';

const TOKEN = document.querySelector('meta[name="jarvis-token"]').content;
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
async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'x-jarvis-token': TOKEN, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message ?? '오류'), { code: data.error?.code });
  return data;
}
const toast = (m) => window.toast?.(m);
const confirmBox = (o) => window.askConfirm(o);

const CSS = `
.deck-row { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 8px 0; border-top: 1px solid var(--line); }
.deck-row:first-child { border-top: 0; }
.deck-mini { --b-bg: var(--accent-soft); --b-fg: var(--accent); flex: 0 0 48px; width: 48px; height: 48px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; background: var(--b-bg); color: var(--b-fg); border: 1px solid var(--line); }
.deck-mini svg { width: 26px; height: 26px; }
.deck-info { flex: 1; min-width: 0; }
.deck-info strong { display: block; font-weight: 600; overflow-wrap: anywhere; }
.deck-info span { display: block; font-size: 14px; color: var(--muted); overflow-wrap: anywhere; }
.deck-acts { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.deck-acts button.act { padding: 0 12px; }
.deck-form .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.deck-form .two label { margin-top: 16px; }
.g-state { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
.g-state i { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
.g-state[data-on="true"] i { background: var(--ok); }
.steps { margin: 8px 0 0; padding-left: 20px; font-size: 14px; color: var(--muted); }
.steps li { margin: 4px 0; }
.steps code { font-size: 13px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 0 4px; overflow-wrap: anywhere; }
@media (max-width: 520px) { .deck-row { flex-wrap: wrap; } .deck-acts { width: 100%; justify-content: flex-start; } .deck-form .two { grid-template-columns: 1fr; } }
${colorCss('.deck-mini')}
`;

const state = { list: null, google: null, editing: null, poll: null, board: null };

function summary(a) {
  switch (a.type) {
    case 'ask': return `물어보기: "${a.text}"`;
    case 'open': return `화면 열기: ${VIEW_NAMES[a.view] ?? a.view}`;
    case 'pc-app': return `PC 프로그램: ${a.path}${a.args?.length ? ` ${a.args.join(' ')}` : ''}`;
    case 'pc-keys': return `PC 단축키: ${a.keys}`;
    case 'pc-url': return `PC에서 열기: ${a.url}`;
    default: return ACTION_NAMES[a.type] ?? a.type;
  }
}

// ---------- 구글 ----------
function googleCard() {
  const g = state.google;
  const local = state.list?.local !== false;
  const card = el('div', { class: 'card', id: 'google-card' });
  card.append(el('h3', {}, '구글 캘린더·Tasks'),
    el('p', { class: 'muted' }, '연결하면 메인 화면에서 오늘 일정과 할 일을 바로 보고, 새 일정·할 일을 넣고, 할 일을 완료로 바꿀 수 있어요. 아침 브리핑에도 오늘 일정·할 일이 들어가요(브리핑은 이 PC 안 AI만 읽어요). 일정·할 일 글은 구글과 이 PC 사이에서만 오가고 클라우드 AI로는 보내지 않아요.'));
  const on = Boolean(g?.connected);
  card.append(el('p', { class: 'g-state', 'data-on': String(on), role: 'status' }, el('i', { 'aria-hidden': 'true' }),
    !g ? '상태를 읽지 못했어요' : on ? '연결됨' : g.waiting ? '로그인 창에서 기다리는 중…' : g.configured ? '연결 안 됨' : '준비 필요(아래 방법)'));
  if (g?.lastError && !on) card.append(el('p', { class: 'field-error' }, g.lastError.message));
  const row = el('div', { class: 'row' });
  if (on) {
    row.append(el('button', { class: 'act danger', type: 'button', id: 'g-disconnect', onclick: disconnect }, '연결 끊기'));
  } else if (g?.configured) {
    row.append(el('button', { class: 'act primary', type: 'button', id: 'g-connect', disabled: !local || undefined, onclick: connect }, g.waiting ? '로그인 창 다시 열기' : '구글 연결하기'));
    if (g.waiting) row.append(el('button', { class: 'act', type: 'button', onclick: cancel }, '그만두기'));
    if (!local) card.append(el('p', { class: 'muted' }, '구글 연결은 JARVIS를 켠 PC 화면(127.0.0.1)에서 해 주세요. 로그인 뒤 돌아오는 곳이 그 PC라서 다른 기기에서는 끝낼 수 없어요.'));
  }
  card.append(row);
  card.append(el('details', { class: 'more', ...(g?.configured ? {} : { open: true }) }, el('summary', {}, '연결 준비 방법(처음 한 번)'),
    el('ol', { class: 'steps' },
      el('li', {}, 'Google Cloud 콘솔(console.cloud.google.com)에서 새 프로젝트를 만들어요.'),
      el('li', {}, '"API 및 서비스 → 라이브러리"에서 Google Calendar API와 Google Tasks API를 켜요.'),
      el('li', {}, '"OAuth 동의 화면"을 만들고(외부, 테스트 중), 테스트 사용자에 내 구글 계정을 넣어요.'),
      el('li', {}, '"사용자 인증 정보 → OAuth 클라이언트 ID 만들기 → 데스크톱 앱"을 골라요.'),
      el('li', {}, '나온 값을 JARVIS 폴더의 .env.local에 적어요: ', el('code', {}, 'JARVIS_GOOGLE_CLIENT_ID=…'), ' ', el('code', {}, 'JARVIS_GOOGLE_CLIENT_SECRET=…')),
      el('li', {}, 'JARVIS를 다시 켜고, 이 PC 화면에서 "구글 연결하기"를 눌러 직접 로그인해요.'),
    ),
    el('p', { class: 'muted' }, '받은 열쇠는 이 PC의 데이터 폴더(google-token.json)에만 저장해요. 연결 끊기를 누르면 구글에도 취소를 알리고 파일을 지워요.')));
  return card;
}
async function connect() {
  try {
    const r = await api('POST', '/api/google/connect', {});
    const w = window.open(r.authUrl, '_blank');
    if (!w) toast('새 창이 막혔어요. 창 막기를 풀고 다시 눌러 주세요.');
    else { w.opener = null; toast('새 창에서 구글에 로그인해 주세요(5분 안에).'); }
    await loadGoogle();
    clearInterval(state.poll);
    const until = Date.now() + 5 * 60 * 1000;
    state.poll = setInterval(async () => {
      if (Date.now() > until) { clearInterval(state.poll); return; }
      try {
        const g = await api('GET', '/api/google');
        if (!g.waiting) { clearInterval(state.poll); state.google = g; render(); toast(g.connected ? '구글을 연결했어요' : '연결하지 않았어요'); }
      } catch { /* 다음에 다시 */ }
    }, 2000);
  } catch (e) { toast(`연결을 시작하지 못했어요: ${e.message}`); }
}
async function cancel() {
  clearInterval(state.poll);
  try { state.google = await api('POST', '/api/google/cancel', {}); } catch { /* 무시 */ }
  render();
}
async function disconnect() {
  const yes = await confirmBox({ title: '구글 연결을 끊을까요?', body: '이 PC에 저장한 구글 열쇠를 지우고 구글에도 취소를 알려요. 구글 캘린더·Tasks의 자료는 지우지 않아요. 다시 쓰려면 로그인을 새로 해야 해요.', ok: '연결 끊기' });
  if (!yes) return;
  try { await api('DELETE', '/api/google'); toast('구글 연결을 끊었어요'); } catch (e) { toast(`끊지 못했어요: ${e.message}`); }
  await loadGoogle();
}

// ---------- 단축키 ----------
async function saveList(buttons, msg) {
  try {
    state.list = await api('PUT', '/api/shortcuts', { buttons });
    state.editing = null;
    render();
    if (msg) toast(msg);
    return true;
  } catch (e) {
    const err = $('#deck-form-err');
    if (err && state.editing) err.textContent = e.message; else toast(`저장하지 못했어요: ${e.message}`);
    return false;
  }
}
function buttonsCard() {
  const l = state.list;
  const card = el('div', { class: 'card', id: 'deck-edit-card' });
  card.append(el('h3', {}, '단축키 버튼'),
    el('p', { class: 'muted' }, '메인 화면(캐릭터와 대화하기)에 큰 버튼으로 보여요. 토스 기기에서 누르면 자비스에게 묻거나, 화면을 열거나, 이 PC에서 프로그램·단축키·웹 주소를 실행해요. PC에서 실행하는 버튼은 오른쪽 위에 작은 점이 있어요.'));
  if (!l) { card.append(el('p', { class: 'field-error' }, '버튼 목록을 읽지 못했어요.')); return card; }
  if (!l.local) card.append(el('p', { class: 'muted' }, 'PC 조작 버튼(프로그램·단축키·웹 주소)은 JARVIS를 켠 PC 화면에서만 만들거나 고칠 수 있어요. 이 기기에서는 이름·색·순서만 바꿀 수 있어요.'));
  const list = el('div', { id: 'deck-rows' });
  if (!l.buttons.length) list.append(el('div', { class: 'empty' }, el('strong', {}, '버튼이 없어요'), el('p', {}, '"버튼 추가"로 첫 버튼을 만들어 보세요.')));
  l.buttons.forEach((b, i) => {
    const pcLocked = b.action.type.startsWith('pc-') && !l.local;
    list.append(el('div', { class: 'deck-row', 'data-id': b.id },
      el('span', { class: 'deck-mini', 'data-color': b.color, html: iconSvg(b.icon, 26) }),
      el('div', { class: 'deck-info' }, el('strong', {}, b.label), el('span', {}, summary(b.action))),
      el('div', { class: 'deck-acts' },
        el('button', { class: 'act', type: 'button', 'aria-label': `${b.label} 위로`, disabled: i === 0 || undefined, onclick: () => move(i, -1) }, '위로'),
        el('button', { class: 'act', type: 'button', 'aria-label': `${b.label} 아래로`, disabled: i === l.buttons.length - 1 || undefined, onclick: () => move(i, 1) }, '아래로'),
        el('button', { class: 'act', type: 'button', 'aria-label': `${b.label} 고치기`, onclick: () => { state.editing = { ...b, action: { ...b.action }, pcLocked }; render(); $('#deck-label')?.focus(); } }, '고치기'),
        el('button', { class: 'act danger', type: 'button', 'aria-label': `${b.label} 지우기`, onclick: () => remove(b) }, '지우기'))));
  });
  card.append(list);
  if (state.editing) card.append(editForm());
  else {
    card.append(el('div', { class: 'row', style: 'margin-top:16px' },
      el('button', { class: 'act primary', type: 'button', id: 'deck-add', disabled: l.buttons.length >= 24 || undefined, onclick: () => { state.editing = { id: null, label: '', icon: 'star', color: 'orange', action: { type: 'ask', text: '' } }; render(); $('#deck-label')?.focus(); } }, '버튼 추가'),
      l.custom ? el('button', { class: 'act', type: 'button', onclick: resetAll }, '기본 버튼으로 되돌리기') : null));
  }
  return card;
}
function move(i, d) {
  const b = [...state.list.buttons];
  [b[i], b[i + d]] = [b[i + d], b[i]];
  saveList(b);
}
async function remove(btn) {
  const yes = await confirmBox({ title: `"${btn.label}" 버튼을 지울까요?`, body: '메인 화면에서 이 버튼이 사라져요. 지운 뒤에는 다시 만들어야 해요.', ok: '버튼 지우기' });
  if (yes) saveList(state.list.buttons.filter((x) => x.id !== btn.id), `"${btn.label}" 버튼을 지웠어요`);
}
async function resetAll() {
  const yes = await confirmBox({ title: '기본 버튼으로 되돌릴까요?', body: '지금 버튼을 모두 지우고 처음 버튼 6개(오늘 일정·할 일·브리핑 듣기·오늘 날씨·소리 켬·끔·멈추기)로 바꿔요.', ok: '모두 지우고 되돌리기' });
  if (!yes) return;
  try { state.list = await api('POST', '/api/shortcuts/reset', {}); render(); toast('기본 버튼으로 되돌렸어요'); } catch (e) { toast(`되돌리지 못했어요: ${e.message}`); }
}

function editForm() {
  const e = state.editing;
  const l = state.list;
  const pcAllowed = l.local && l.pcSupported;
  const types = Object.keys(ACTION_NAMES).filter((t) => !t.startsWith('pc-') || pcAllowed || (e.pcLocked && e.action.type === t));
  const opt = (v, label, cur) => el('option', { value: v, selected: v === cur || undefined }, label);
  const form = el('form', { class: 'deck-form', id: 'deck-form', novalidate: true });
  form.append(el('h3', { style: 'margin-top:16px' }, e.id ? '버튼 고치기' : '새 버튼'),
    el('label', { for: 'deck-label' }, '버튼 이름(20자까지)'),
    el('input', { type: 'text', id: 'deck-label', maxlength: '20', value: e.label, autocomplete: 'off', 'aria-describedby': 'deck-label-err' }),
    el('p', { class: 'field-error', id: 'deck-label-err' }),
    el('div', { class: 'two' },
      el('div', {}, el('label', { for: 'deck-icon' }, '아이콘'), el('select', { id: 'deck-icon' }, Object.entries(ICON_NAMES).map(([k, n]) => opt(k, n, e.icon)))),
      el('div', {}, el('label', { for: 'deck-color' }, '색'), el('select', { id: 'deck-color' }, Object.entries(COLOR_NAMES).map(([k, n]) => opt(k, n, e.color))))),
    el('label', { for: 'deck-type' }, '누르면 할 일'),
    el('select', { id: 'deck-type', disabled: e.pcLocked || undefined }, types.map((t) => opt(t, ACTION_NAMES[t], e.action.type))),
    el('div', { id: 'deck-fields' }),
    el('p', { class: 'field-error', id: 'deck-form-err', role: 'alert' }),
    el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:8px' },
      el('button', { class: 'act', type: 'button', onclick: () => { state.editing = null; render(); $('#deck-add')?.focus(); } }, '취소'),
      el('button', { class: 'act primary', type: 'submit' }, e.id ? '고친 내용 저장' : '버튼 저장')));
  if (!pcAllowed && l.pcSupported && !e.pcLocked) form.append(el('p', { class: 'muted' }, 'PC 프로그램·단축키·웹 주소 버튼은 JARVIS를 켠 PC 화면에서 만들 수 있어요.'));
  const fields = $('#deck-fields', form);
  const draw = () => {
    const t = $('#deck-type', form).value;
    const a = e.action.type === t ? e.action : {};
    const lock = e.pcLocked;
    const input = (id, label, value, attrs = {}) => [el('label', { for: id }, label), el('input', { type: 'text', id, value: value ?? '', autocomplete: 'off', disabled: lock || undefined, ...attrs })];
    const hint = (t2) => el('p', { class: 'muted' }, t2);
    if (t === 'ask') fields.replaceChildren(...input('deck-text', '자비스에게 할 말', a.text, { maxlength: '300', placeholder: '예: 오늘 날씨 어때?' }));
    else if (t === 'open') fields.replaceChildren(el('label', { for: 'deck-view' }, '열 화면'), el('select', { id: 'deck-view' }, Object.entries(VIEW_NAMES).map(([k, n]) => opt(k, n, a.view))));
    else if (t === 'pc-app') fields.replaceChildren(...input('deck-path', '프로그램 전체 경로', a.path, { placeholder: 'C:\\Program Files\\...\\app.exe' }),
      hint('Windows는 .exe 파일이나 바로 가기(.lnk·.url), Mac은 .app만 돼요. 배치·스크립트 파일은 안 돼요. 바로 가기는 바탕 화면에서 오른쪽 클릭 → "경로 복사"로 넣을 수 있어요.'),
      el('label', { for: 'deck-args' }, '프로그램에 넘길 값(선택, 한 줄에 하나)'), el('textarea', { id: 'deck-args', rows: '2', disabled: lock || undefined }, (a.args ?? []).join('\n')));
    else if (t === 'pc-keys') fields.replaceChildren(...input('deck-keys', 'PC 단축키', a.keys, { placeholder: '예: ctrl+shift+m, alt+tab, volumeup, playpause' }),
      hint('보조 키(ctrl·shift·alt·win)와 보통 키 하나를 +로 이어요. 지금 PC 앞에 떠 있는 창으로 가요. 소리 키: volumeup·volumedown·mute, 재생 키: playpause·next·prev.'));
    else if (t === 'pc-url') fields.replaceChildren(...input('deck-url', '웹 주소', a.url, { placeholder: 'https://www.youtube.com' }), hint('JARVIS를 켠 PC의 기본 브라우저에서 열려요.'));
    else fields.replaceChildren(hint(t === 'voice' ? '캐릭터 목소리를 켜고 꺼요.' : t === 'stop' ? '말하던 것과 답 만들기를 멈춰요.' : '오늘 브리핑을 읽어 줘요.'));
  };
  $('#deck-type', form).addEventListener('change', draw);
  draw();
  const label = $('#deck-label', form);
  label.addEventListener('blur', () => { $('#deck-label-err', form).textContent = label.value.trim() ? '' : '버튼 이름을 적어 주세요.'; label.setAttribute('aria-invalid', String(!label.value.trim())); });
  label.addEventListener('input', () => { $('#deck-label-err', form).textContent = ''; label.removeAttribute('aria-invalid'); });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = label.value.trim();
    if (!name) { $('#deck-label-err', form).textContent = '버튼 이름을 적어 주세요.'; label.focus(); return; }
    const t = $('#deck-type', form).value;
    let action = { type: t };
    if (e.pcLocked) action = e.action;
    else if (t === 'ask') action.text = $('#deck-text', form).value;
    else if (t === 'open') action.view = $('#deck-view', form).value;
    else if (t === 'pc-app') { action.path = $('#deck-path', form).value.trim().replace(/^"|"$/g, ''); action.args = $('#deck-args', form).value.split('\n').map((x) => x.trim()).filter(Boolean); }
    else if (t === 'pc-keys') action.keys = $('#deck-keys', form).value;
    else if (t === 'pc-url') action.url = $('#deck-url', form).value.trim();
    const btn = { ...(e.id ? { id: e.id } : {}), label: name, icon: $('#deck-icon', form).value, color: $('#deck-color', form).value, action };
    const list = e.id ? state.list.buttons.map((x) => (x.id === e.id ? btn : x)) : [...state.list.buttons, btn];
    saveList(list, e.id ? '버튼을 고쳤어요' : '버튼을 만들었어요');
  });
  return form;
}

// 대기화면(쉬는 화면)의 "해야 할 일"을 가져오는 곳. ax.designjux.com은 나중에 연동할 자리(고를 수 없음).
function boardCard() {
  const b = state.board;
  const card = el('div', { class: 'card', id: 'board-card' }, el('h3', {}, '대기화면'),
    el('p', { class: 'muted' }, '쉬는 화면에 고른 친구가 조는 모습, 날씨(설정 → 스킬의 날씨·기본 위치), 오늘 중요한 일(구글 오늘 일정·기한 된 할 일), 해야 할 일을 보여 줘요.'));
  if (!b) { card.append(el('p', { class: 'field-error' }, '설정을 읽지 못했어요.')); return card; }
  const sel = el('select', { id: 'board-source' }, b.sources.map((s) => el('option', { value: s.id, selected: s.id === b.todoSource || undefined, disabled: s.planned || undefined }, s.planned ? `${s.label} (${s.note})` : s.label)));
  sel.addEventListener('change', async () => {
    try { state.board = await api('PUT', '/api/board/settings', { todoSource: sel.value }); toast('할 일 가져오는 곳을 바꿨어요'); } catch (e) { toast(`바꾸지 못했어요: ${e.message}`); }
    render();
  });
  card.append(el('label', { for: 'board-source' }, '해야 할 일 가져오는 곳'), sel);
  return card;
}

function render() {
  const box = $('#deck-settings');
  if (!box) return;
  box.replaceChildren(googleCard(), boardCard(), buttonsCard());
}
async function loadGoogle() {
  try { state.google = await api('GET', '/api/google'); } catch { state.google = null; }
  render();
}
async function load() {
  try { state.list = await api('GET', '/api/shortcuts'); } catch { state.list = null; }
  try { state.board = await api('GET', '/api/board/settings'); } catch { state.board = null; }
  await loadGoogle();
}

document.head.append(el('style', {}, CSS));
window.deckSettings = { load };
if (location.hash === '#shortcuts') load();
