// 단축키 판(2026-11-15 사용자 요청: 스트림덱 같은 버튼 판, 자비스 기능 + PC 조작).
// 버튼은 메인 화면(/jarvis)에 크게 보이고, 누르면 정해 둔 일을 한다.
// - 화면 안 일(ask·open·voice·stop·briefing): 화면이 바로 한다. 서버는 저장만 한다.
// - PC 조작(pc-app·pc-keys·pc-url·pc-text·multi): 이 PC에서 서버가 한다. 쉘을 거치지 않고, 정해 둔 프로그램·키·주소·글자만 쓴다.
//   PC 조작 버튼은 이 PC 화면(주소 127.0.0.1·localhost)에서만 만들고 고칠 수 있다. 다른 기기는 누르기만 한다.
// 2026-11-15 더함(비슷한 오픈 소스 스트림덱 — OpenDeck·Companion·Macro-Deck·StreamController·streamdeck-ui·deckmaster —
// 에 흔하고 사용자 요청이 많은 것): 페이지(폴더) · 여러 동작 한 번에(multi, 기다리기 포함) · 길게 누르면 다른 동작(hold) ·
// 실시간 버튼(widget: 시계·PC 상태) · 글자 입력(pc-text, 클립보드에 넣고 붙여넣기) · 누르기 전 확인(confirm).
import { existsSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { cpus, totalmem, freemem } from 'node:os';
import { AppError } from '../errors.js';
import { parseKeys } from './pc-runner.js';

const KEY = 'shortcuts.buttons';
const PAGES_KEY = 'shortcuts.pages';
export const MAX_BUTTONS = 48;
export const MAX_PAGES = 6;
export const MAX_STEPS = 8;
export const MAX_WAIT_MS = 10_000;
export const MAX_TOTAL_WAIT_MS = 15_000;
export const ICONS = ['calendar', 'check', 'sun', 'chat', 'speaker', 'mute', 'stop', 'play', 'mic', 'app', 'keyboard', 'globe', 'star', 'heart', 'home', 'music', 'volume-up', 'volume-down', 'bolt', 'camera', 'coffee', 'moon', 'gear', 'search'];
export const COLORS = ['orange', 'blue', 'green', 'pink', 'purple', 'yellow', 'teal', 'gray'];
export const OPEN_VIEWS = ['calendar', 'tasks', 'briefing', 'check', 'settings', 'pals'];
export const WIDGETS = ['clock', 'pc-stats'];
export const CLIENT_ACTIONS = ['ask', 'open', 'voice', 'stop', 'briefing', 'widget'];
export const PC_ACTIONS = ['pc-app', 'pc-keys', 'pc-url', 'pc-text', 'multi'];
export const STEP_TYPES = ['pc-app', 'pc-keys', 'pc-url', 'pc-text', 'wait'];
export const DEFAULT_PAGE = { id: 'main', name: '기본' };
const APP_EXT = process.platform === 'win32' ? ['.exe', '.lnk', '.url'] : process.platform === 'darwin' ? ['.app'] : [];

// 처음 쓰는 사람용 기본 버튼(화면 안 일만, PC 조작 없음)
export function defaultButtons() {
  return [
    { id: 'd-cal', label: '오늘 일정', icon: 'calendar', color: 'blue', page: 'main', action: { type: 'open', view: 'calendar' } },
    { id: 'd-tasks', label: '할 일', icon: 'check', color: 'green', page: 'main', action: { type: 'open', view: 'tasks' } },
    { id: 'd-brief', label: '브리핑 듣기', icon: 'sun', color: 'orange', page: 'main', action: { type: 'briefing' } },
    { id: 'd-weather', label: '오늘 날씨', icon: 'globe', color: 'teal', page: 'main', action: { type: 'ask', text: '오늘 날씨 어때?' } },
    { id: 'd-voice', label: '소리 켬·끔', icon: 'speaker', color: 'purple', page: 'main', action: { type: 'voice' } },
    { id: 'd-stop', label: '멈추기', icon: 'stop', color: 'gray', page: 'main', action: { type: 'stop' } },
  ];
}

const text = (v, max, name) => {
  if (typeof v !== 'string' || !v.trim()) throw new AppError('invalid_input', `${name}을(를) 적어 주세요`);
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (s.length > max) throw new AppError('invalid_input', `${name}은(는) ${max}자까지`);
  return s;
};

// 붙여넣을 글: 줄바꿈·탭은 두고 다른 제어 문자는 뺀다. 500자까지.
export function checkTypeText(v) {
  if (typeof v !== 'string' || !v.trim()) throw new AppError('invalid_input', '입력할 글을 적어 주세요');
  const s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  if (s.length > 500) throw new AppError('invalid_input', '입력할 글은 500자까지');
  return s;
}

// 프로그램 경로 확인: 절대 경로, 있는 파일, 허용한 종류(Windows .exe·.lnk·.url / Mac .app)만. 스크립트(.bat·.ps1 등)는 안 받는다.
export function checkAppPath(path, { exists = existsSync, isFile = (p) => { try { const s = statSync(p); return s.isFile() || (process.platform === 'darwin' && s.isDirectory()); } catch { return false; } }, platform = process.platform } = {}) {
  const p = text(path, 400, '프로그램 경로');
  const abs = platform === 'win32' ? /^[A-Za-z]:\\/.test(p) : p.startsWith('/');
  if (!abs || p.includes('..')) throw new AppError('invalid_input', '프로그램 경로는 전체 경로로 적어 주세요(예: C:\\Program Files\\...\\app.exe)');
  const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
  const allowed = platform === 'win32' ? ['.exe', '.lnk', '.url'] : platform === 'darwin' ? ['.app'] : [];
  if (!allowed.includes(ext)) throw new AppError('invalid_input', `이 PC에서는 ${allowed.join('·') || '프로그램 열기를'} ${allowed.length ? '파일만 열 수 있어요' : '지원하지 않아요'}`);
  if (!exists(p) || !isFile(p)) throw new AppError('invalid_input', '그 경로에 프로그램이 없어요');
  return p;
}

export function checkUrl(v) {
  const s = text(v, 500, '웹 주소');
  let u;
  try { u = new URL(s); } catch { throw new AppError('invalid_input', '웹 주소 형식이 아니에요(예: https://www.youtube.com)'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new AppError('invalid_input', 'http·https 주소만 열 수 있어요');
  return u.href;
}

// PC 한 동작(여러 동작의 한 칸으로도 씀)
function checkPcStep(a, { pathCheck }) {
  switch (a?.type) {
    case 'pc-app': {
      const args = a.args === undefined ? [] : a.args;
      if (!Array.isArray(args) || args.length > 8) throw new AppError('invalid_input', '프로그램 인자는 8개까지');
      return { type: 'pc-app', path: pathCheck(a.path), args: args.map((x) => text(x, 200, '프로그램 인자')) };
    }
    case 'pc-keys': {
      const keys = text(a.keys, 60, '단축키');
      parseKeys(keys);
      return { type: 'pc-keys', keys: keys.toLowerCase().replace(/\s+/g, '') };
    }
    case 'pc-url': return { type: 'pc-url', url: checkUrl(a.url) };
    case 'pc-text': return { type: 'pc-text', text: checkTypeText(a.text) };
    case 'wait': {
      const ms = Number(a.ms);
      if (!Number.isInteger(ms) || ms < 100 || ms > MAX_WAIT_MS) throw new AppError('invalid_input', `기다리기는 0.1~${MAX_WAIT_MS / 1000}초`);
      return { type: 'wait', ms };
    }
    default: return null;
  }
}

function checkAction(a, { pathCheck }) {
  if (!a || typeof a !== 'object') throw new AppError('invalid_input', '할 일(action)이 필요함');
  switch (a.type) {
    case 'ask': return { type: 'ask', text: text(a.text, 300, '물어볼 말') };
    case 'open':
      if (!OPEN_VIEWS.includes(a.view)) throw new AppError('invalid_input', `열 화면은 ${OPEN_VIEWS.join('·')} 중 하나`);
      return { type: 'open', view: a.view };
    case 'voice': case 'stop': case 'briefing': return { type: a.type };
    case 'widget':
      if (!WIDGETS.includes(a.kind)) throw new AppError('invalid_input', `실시간 버튼은 ${WIDGETS.join('·')} 중 하나`);
      return { type: 'widget', kind: a.kind };
    case 'multi': {
      if (!Array.isArray(a.steps) || a.steps.length < 1 || a.steps.length > MAX_STEPS) throw new AppError('invalid_input', `여러 동작은 1~${MAX_STEPS}칸`);
      const steps = a.steps.map((s) => {
        if (!STEP_TYPES.includes(s?.type)) throw new AppError('invalid_input', `여러 동작에 넣을 수 없는 칸: ${String(s?.type).slice(0, 20)}`);
        return checkPcStep(s, { pathCheck });
      });
      if (!steps.some((s) => s.type !== 'wait')) throw new AppError('invalid_input', '여러 동작에 기다리기 말고 할 일이 하나는 있어야 해요');
      const total = steps.filter((s) => s.type === 'wait').reduce((n, s) => n + s.ms, 0);
      if (total > MAX_TOTAL_WAIT_MS) throw new AppError('invalid_input', `기다리기는 모두 합쳐 ${MAX_TOTAL_WAIT_MS / 1000}초까지`);
      return { type: 'multi', steps };
    }
    default: {
      const step = PC_ACTIONS.includes(a.type) ? checkPcStep(a, { pathCheck }) : null;
      if (step) return step;
      throw new AppError('invalid_input', `모르는 할 일 종류: ${String(a.type).slice(0, 20)}`);
    }
  }
}

export function validatePages(list) {
  if (list === undefined || list === null) return [DEFAULT_PAGE];
  if (!Array.isArray(list) || list.length < 1) throw new AppError('invalid_input', '페이지는 하나 이상');
  if (list.length > MAX_PAGES) throw new AppError('invalid_input', `페이지는 ${MAX_PAGES}개까지`);
  const seen = new Set();
  return list.map((p) => {
    const id = typeof p?.id === 'string' && /^[a-z0-9-]{1,24}$/.test(p.id) ? p.id : `p-${randomBytes(3).toString('hex')}`;
    if (seen.has(id)) throw new AppError('invalid_input', '같은 페이지 번호가 두 번 있음');
    seen.add(id);
    return { id, name: text(p?.name, 12, '페이지 이름') };
  });
}

export function validateButtons(list, { pathCheck = checkAppPath, pages = [DEFAULT_PAGE] } = {}) {
  if (!Array.isArray(list)) throw new AppError('invalid_input', 'buttons는 목록이어야 함');
  if (list.length > MAX_BUTTONS) throw new AppError('invalid_input', `버튼은 ${MAX_BUTTONS}개까지`);
  const pageIds = new Set(pages.map((p) => p.id));
  const seen = new Set();
  return list.map((b) => {
    if (!b || typeof b !== 'object') throw new AppError('invalid_input', '버튼 형식이 아님');
    const id = typeof b.id === 'string' && /^[a-z0-9-]{1,24}$/.test(b.id) ? b.id : `b-${randomBytes(4).toString('hex')}`;
    if (seen.has(id)) throw new AppError('invalid_input', '같은 버튼 번호가 두 번 있음');
    seen.add(id);
    const action = checkAction(b.action, { pathCheck });
    const out = {
      id,
      label: text(b.label, 20, '버튼 이름'),
      icon: ICONS.includes(b.icon) ? b.icon : 'star',
      color: COLORS.includes(b.color) ? b.color : 'orange',
      page: pageIds.has(b.page) ? b.page : pages[0].id,
      action,
    };
    if (b.hold !== undefined && b.hold !== null) {
      if (action.type === 'widget') throw new AppError('invalid_input', '실시간 버튼에는 길게 누르기를 넣을 수 없어요');
      const hold = checkAction(b.hold, { pathCheck });
      if (hold.type === 'widget') throw new AppError('invalid_input', '길게 누르기로 실시간 버튼은 고를 수 없어요');
      out.hold = hold;
    }
    if (b.confirm === true && action.type !== 'widget') out.confirm = true;
    return out;
  });
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isPc = (a) => Boolean(a && PC_ACTIONS.includes(a.type));
const pcPart = (b) => ({ action: isPc(b.action) ? b.action : null, hold: isPc(b.hold) ? b.hold : null });

// PC 상태(CPU·메모리 %). CPU는 지난번 잰 때와의 차이로 계산한다.
export function createStatsReader({ cpusImpl = cpus, total = totalmem, free = freemem } = {}) {
  let last = null;
  const sample = () => cpusImpl().reduce((acc, c) => { const t = Object.values(c.times).reduce((n, v) => n + v, 0); return { idle: acc.idle + c.times.idle, total: acc.total + t }; }, { idle: 0, total: 0 });
  return () => {
    const now = sample();
    let cpu = null;
    if (last && now.total > last.total) cpu = Math.round((1 - (now.idle - last.idle) / (now.total - last.total)) * 100);
    last = now;
    const mem = Math.round((1 - free() / total()) * 100);
    return { cpu: cpu === null ? null : Math.min(100, Math.max(0, cpu)), mem: Math.min(100, Math.max(0, mem)), at: new Date().toISOString() };
  };
}

export class Shortcuts {
  // runner: PC 조작을 실제로 하는 것(pc-runner.js). 검사에서는 가짜. sleep: 여러 동작의 기다리기(검사에서는 바로 끝냄)
  constructor({ settings, runner, pathCheck = checkAppPath, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), stats = createStatsReader() }) {
    Object.assign(this, { settings, runner, pathCheck, sleep, stats });
    this.lastPress = null;
    this.running = new Set();
    this.stats(); // CPU 첫 기준점
  }

  pages() {
    const saved = this.settings.get(PAGES_KEY, null);
    return Array.isArray(saved) && saved.length ? saved : [DEFAULT_PAGE];
  }

  list() {
    const saved = this.settings.get(KEY, null);
    const pages = this.pages();
    const ids = new Set(pages.map((p) => p.id));
    const buttons = (Array.isArray(saved) ? saved : defaultButtons()).map((b) => (ids.has(b.page) ? b : { ...b, page: pages[0].id }));
    return {
      buttons,
      pages,
      custom: Array.isArray(saved),
      icons: ICONS,
      colors: COLORS,
      views: OPEN_VIEWS,
      widgets: WIDGETS,
      maxButtons: MAX_BUTTONS,
      maxPages: MAX_PAGES,
      pcSupported: Boolean(this.runner?.supported),
      appTypes: APP_EXT,
      lastPress: this.lastPress,
    };
  }

  // 목록 통째로 저장(pages를 함께 보내면 페이지도 바꿈). local=false(다른 기기)면 PC 조작(누르기·길게 누르기)을 새로 만들거나 바꿀 수 없다
  // (그대로 두기·지우기·순서·페이지 옮기기·이름·색은 됨).
  save(list, { local = false, pages } = {}) {
    const before = new Map(this.list().buttons.map((b) => [b.id, b]));
    const nextPages = pages === undefined ? this.pages() : validatePages(pages);
    // 다른 기기가 보낸 PC 조작 버튼은 경로를 다시 확인하지 않고 저장된 것과 같은지만 본다.
    const next = validateButtons(list, { pathCheck: local ? this.pathCheck : (p) => text(p, 400, '프로그램 경로'), pages: nextPages });
    if (!local) {
      for (const b of next) {
        const now = pcPart(b);
        if (!now.action && !now.hold) continue;
        const old = before.get(b.id);
        if (!old || !same(pcPart(old), now)) throw new AppError('pc_local_only', 'PC 조작 버튼은 이 PC 화면(127.0.0.1)에서만 만들고 고칠 수 있어요');
      }
    }
    if (pages !== undefined) this.settings.set(PAGES_KEY, nextPages);
    this.settings.set(KEY, next);
    return this.list();
  }

  reset() {
    this.settings.set(KEY, null);
    this.settings.set(PAGES_KEY, null);
    return this.list();
  }

  async #runStep(s) {
    if (s.type === 'pc-app') return this.runner.openApp(this.pathCheck(s.path), s.args);
    if (s.type === 'pc-keys') return this.runner.sendKeys(s.keys);
    if (s.type === 'pc-url') return this.runner.openUrl(checkUrl(s.url));
    if (s.type === 'pc-text') {
      if (!this.runner.typeText) throw new AppError('not_configured', '이 PC에서는 글자 입력을 지원하지 않아요');
      return this.runner.typeText(s.text);
    }
    if (s.type === 'wait') return this.sleep(s.ms);
    throw new AppError('invalid_input', '모르는 동작');
  }

  // 누르기(hold=true면 길게 누르기 동작). 화면 안 일이면 무엇을 할지만 돌려준다. PC 조작이면 여기서 한다(같은 버튼은 끝날 때까지 한 번만).
  async press(id, { hold = false } = {}) {
    const b = this.list().buttons.find((x) => x.id === id);
    if (!b) throw new AppError('not_found', '그 버튼이 없어요');
    const action = hold ? b.hold : b.action;
    if (!action) throw new AppError('invalid_state', '이 버튼은 길게 누르기 동작이 없어요');
    if (!isPc(action)) return { id, client: true, hold, action };
    if (!this.runner?.supported) throw new AppError('not_configured', '이 PC에서는 PC 조작을 지원하지 않아요');
    if (this.running.has(id)) throw new AppError('invalid_state', '아직 앞에서 누른 일을 하는 중이에요');
    this.running.add(id);
    let step = 0;
    try {
      const steps = action.type === 'multi' ? action.steps : [action];
      for (const s of steps) { step += 1; await this.#runStep(s); }
      this.lastPress = { id, label: b.label, at: new Date().toISOString(), ok: true, hold };
      return { id, client: false, done: true, hold, steps: steps.length };
    } catch (e) {
      this.lastPress = { id, label: b.label, at: new Date().toISOString(), ok: false, hold };
      const where = action.type === 'multi' ? `${step}번째 칸에서 ` : '';
      if (e instanceof AppError) throw new AppError(e.code, `${where}${e.message}`);
      throw new AppError('shortcut_failed', `${where}PC에서 하지 못했어요: ${e.message}`);
    } finally {
      this.running.delete(id);
    }
  }
}
