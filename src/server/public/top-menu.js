// 메인 화면(/jarvis) 위쪽 막대의 설정 버튼(톱니) → 설정 모음 창(2026-11-15 사용자 요청
// "설정버튼안에 나머지 설정버튼들은 적용하고 스피커 버튼은 적용해줘").
// - 위쪽 막대에는 스피커(소리 켬·끔)와 설정 버튼만 남긴다.
// - 부르면 대답하기 · 카메라로 깨우기 · 장치 점검은 이 창 안으로 옮긴다. 원래 버튼(jarvis.html이 동작을 붙인 것)은
//   숨긴 채 그대로 두고, 창의 줄을 누르면 원래 버튼을 누른다. 켜짐 상태·보임은 원래 버튼을 따라간다.
// - 그 밖의 줄(대화할 AI·서버 바꾸기·단축키 고치기·전체 설정)은 부르는 쪽(deck.js)이 items로 넘긴다.
const $ = (s, root = document) => root.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else if (v !== undefined && v !== false && v !== null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
};

// 창으로 옮기는 원래 버튼: id · 감싼 칸 · 창에 보일 이름 · 켜고 끄는 버튼인지
export const PROXIED = [
  { id: 'ambient', wrap: 'ambient-wrap', label: '부르면 대답하기', toggle: true },
  { id: 'presence', wrap: 'presence-wrap', label: '카메라로 깨우기', toggle: true },
  { id: 'tab-check', label: '장치 점검', toggle: false },
];

// 켜고 끄는 줄의 상태 글
export const stateText = (pressed) => (pressed ? '켜짐' : '꺼짐');

const CSS = `
.setmenu { position: absolute; top: calc(100% + 4px); right: 12px; z-index: 30; width: min(360px, calc(100vw - 24px)); max-height: calc(100vh - 80px); overflow-y: auto; padding: 8px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); color: var(--text); box-shadow: 0 12px 32px rgba(20, 12, 4, .18); opacity: 1; transform: translateY(0); transition: opacity 150ms ease-out, transform 150ms ease-out; }
.setmenu[hidden] { display: block; visibility: hidden; opacity: 0; transform: translateY(-4px); pointer-events: none; }
.sm-title { margin: 8px 12px; font-size: 14px; font-weight: 600; color: var(--muted); }
.sm-sep { height: 1px; margin: 8px 4px; background: var(--line); }
.sm-row { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px; border: 0; border-radius: 14px; background: none; color: var(--text); font: inherit; text-align: left; text-decoration: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.sm-row[hidden] { display: none; }
@media (hover: hover) { .sm-row:hover { background: var(--surface-2); } }
.sm-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.sm-ico { flex: 0 0 40px; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; background: var(--accent-soft); color: var(--accent); }
.sm-ico svg { width: 22px; height: 22px; }
.sm-txt { flex: 1; min-width: 0; }
.sm-txt b { display: block; font-weight: 600; }
.sm-txt small { display: block; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.sm-sw { flex: 0 0 auto; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--line); font-size: 12px; font-weight: 600; color: var(--muted); }
.sm-row[aria-pressed="true"] .sm-sw { background: var(--accent); border-color: transparent; color: #fff; }
.sm-go { flex: 0 0 auto; color: var(--muted); font-size: 18px; }
.sm-hold { display: none !important; }
@media (prefers-reduced-motion: reduce) { .setmenu { transition: opacity 150ms linear; transform: none; } .setmenu[hidden] { transform: none; } }
`;

// items: [{ id, icon(svg 글), label, sub?: () => 글, href?, onclick?, show?: () => boolean, section?: '제목' }]
export function mountTopMenu({ items = [] } = {}) {
  const bar = $('header.bar') ?? $('.bar');
  const gearLink = $('#to-settings');
  if (!bar || !gearLink) return { refresh() {}, close() {} };
  document.head.append(el('style', {}, CSS)); // 막대는 sticky라 창(absolute)이 막대 기준으로 붙는다

  // 원래 버튼들은 숨긴 칸으로 옮긴다(동작·상태는 그대로)
  const hold = el('div', { class: 'sm-hold', 'aria-hidden': 'true' });
  bar.append(hold);
  const gearSvg = gearLink.querySelector('svg')?.outerHTML ?? '';
  const proxied = PROXIED.map((p) => {
    const btn = document.getElementById(p.id);
    if (!btn) return null;
    const wrap = p.wrap ? document.getElementById(p.wrap) : btn.closest('.tipwrap');
    hold.append(wrap ?? btn);
    btn.tabIndex = -1;
    return { ...p, btn, wrap, icon: btn.querySelector('svg')?.outerHTML ?? '' };
  }).filter(Boolean);

  // 톱니: 전체 설정 링크 → 설정 모음 창 열기 버튼
  const gear = el('button', { type: 'button', class: 'icon', id: 'menu-btn', 'aria-label': '설정 열기', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'setmenu', 'aria-describedby': 'tip-settings', html: gearSvg });
  gearLink.replaceWith(gear);

  const panel = el('div', { class: 'setmenu', id: 'setmenu', role: 'region', 'aria-label': '설정', hidden: true });
  bar.append(panel);

  const rows = [];
  function proxyRow(p) {
    const sw = p.toggle ? el('span', { class: 'sm-sw', 'aria-hidden': 'true' }) : el('span', { class: 'sm-go', 'aria-hidden': 'true' }, '›');
    const r = el('button', { type: 'button', class: 'sm-row', id: `sm-${p.id}` }, el('span', { class: 'sm-ico', html: p.icon }), el('span', { class: 'sm-txt' }, el('b', {}, p.label)), sw);
    r.addEventListener('click', () => {
      p.btn.click();
      if (!p.toggle) close({ focus: false });
      else sync();
    });
    rows.push({ el: r, sync: () => {
      const hidden = Boolean(p.wrap?.hidden || p.btn.hidden);
      r.hidden = hidden;
      if (p.toggle) {
        const on = p.btn.getAttribute('aria-pressed') === 'true';
        r.setAttribute('aria-pressed', String(on));
        sw.textContent = stateText(on);
        r.setAttribute('aria-label', `${p.label} ${stateText(on)}`);
      } else {
        r.setAttribute('aria-label', p.btn.getAttribute('aria-label') ?? p.label);
      }
    } });
    return r;
  }
  function itemRow(it) {
    const sub = el('small', {});
    const inner = [el('span', { class: 'sm-ico', html: it.icon }), el('span', { class: 'sm-txt' }, el('b', {}, it.label), sub), el('span', { class: 'sm-go', 'aria-hidden': 'true' }, '›')];
    const r = it.href ? el('a', { class: 'sm-row', id: `sm-${it.id}`, href: it.href }, ...inner) : el('button', { type: 'button', class: 'sm-row', id: `sm-${it.id}` }, ...inner);
    if (it.onclick) r.addEventListener('click', () => { close({ focus: false }); it.onclick(); });
    rows.push({ el: r, sync: () => {
      r.hidden = it.show ? !it.show() : false;
      const s = it.sub?.() ?? '';
      sub.textContent = s;
      sub.hidden = !s;
    } });
    return r;
  }

  const toggles = proxied.filter((p) => p.toggle);
  const others = proxied.filter((p) => !p.toggle);
  panel.append(
    el('p', { class: 'sm-title' }, '이 기기'),
    ...toggles.map(proxyRow),
    ...others.map(proxyRow),
  );
  let lastSection = '이 기기';
  for (const it of items) {
    if (it.section && it.section !== lastSection) { panel.append(el('div', { class: 'sm-sep', 'aria-hidden': 'true' }), el('p', { class: 'sm-title' }, it.section)); lastSection = it.section; }
    panel.append(itemRow(it));
  }

  function sync() { for (const r of rows) r.sync(); }
  // 원래 버튼의 보임·켜짐이 바뀌면 창도 따라간다
  const mo = new MutationObserver(sync);
  for (const p of proxied) {
    mo.observe(p.btn, { attributes: true, attributeFilter: ['aria-pressed', 'aria-label', 'hidden'] });
    if (p.wrap) mo.observe(p.wrap, { attributes: true, attributeFilter: ['hidden'] });
  }

  const visibleRows = () => [...panel.querySelectorAll('.sm-row')].filter((r) => !r.hidden);
  function open() {
    sync();
    panel.hidden = false;
    gear.setAttribute('aria-expanded', 'true');
    gear.setAttribute('aria-pressed', 'true');
    visibleRows()[0]?.focus();
  }
  function close({ focus = true } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    gear.setAttribute('aria-expanded', 'false');
    gear.setAttribute('aria-pressed', 'false');
    if (focus) gear.focus();
  }
  gear.addEventListener('click', () => (panel.hidden ? open() : close()));
  document.addEventListener('keydown', (e) => {
    if (panel.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = visibleRows();
      const i = list.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus();
    }
  });
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !panel.contains(e.target) && !gear.contains(e.target)) close({ focus: false }); });
  sync();
  return { refresh: sync, close, open, isOpen: () => !panel.hidden };
}
