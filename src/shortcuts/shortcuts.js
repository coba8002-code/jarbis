// 단축키 판(2026-11-15 사용자 요청: 스트림덱 같은 버튼 판, 자비스 기능 + PC 조작).
// 버튼은 메인 화면(/jarvis)에 크게 보이고, 누르면 정해 둔 일을 한다.
// - 화면 안 일(ask·open·voice·stop·briefing): 화면이 바로 한다. 서버는 저장만 한다.
// - PC 조작(pc-app·pc-keys·pc-url): 이 PC에서 서버가 한다. 쉘을 거치지 않고, 정해 둔 프로그램·키·주소만 쓴다.
//   PC 조작 버튼은 이 PC 화면(주소 127.0.0.1·localhost)에서만 만들고 고칠 수 있다. 다른 기기는 누르기만 한다.
import { existsSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';
import { parseKeys } from './pc-runner.js';

const KEY = 'shortcuts.buttons';
export const MAX_BUTTONS = 24;
export const ICONS = ['calendar', 'check', 'sun', 'chat', 'speaker', 'mute', 'stop', 'play', 'mic', 'app', 'keyboard', 'globe', 'star', 'heart', 'home', 'music', 'volume-up', 'volume-down', 'bolt', 'camera', 'coffee', 'moon', 'gear', 'search'];
export const COLORS = ['orange', 'blue', 'green', 'pink', 'purple', 'yellow', 'teal', 'gray'];
export const OPEN_VIEWS = ['calendar', 'tasks', 'briefing', 'check', 'settings', 'pals'];
export const CLIENT_ACTIONS = ['ask', 'open', 'voice', 'stop', 'briefing'];
export const PC_ACTIONS = ['pc-app', 'pc-keys', 'pc-url'];
const APP_EXT = process.platform === 'win32' ? ['.exe', '.lnk', '.url'] : process.platform === 'darwin' ? ['.app'] : [];

// 처음 쓰는 사람용 기본 버튼(화면 안 일만, PC 조작 없음)
export function defaultButtons() {
  return [
    { id: 'd-cal', label: '오늘 일정', icon: 'calendar', color: 'blue', action: { type: 'open', view: 'calendar' } },
    { id: 'd-tasks', label: '할 일', icon: 'check', color: 'green', action: { type: 'open', view: 'tasks' } },
    { id: 'd-brief', label: '브리핑 듣기', icon: 'sun', color: 'orange', action: { type: 'briefing' } },
    { id: 'd-weather', label: '오늘 날씨', icon: 'globe', color: 'teal', action: { type: 'ask', text: '오늘 날씨 어때?' } },
    { id: 'd-voice', label: '소리 켬·끔', icon: 'speaker', color: 'purple', action: { type: 'voice' } },
    { id: 'd-stop', label: '멈추기', icon: 'stop', color: 'gray', action: { type: 'stop' } },
  ];
}

const text = (v, max, name) => {
  if (typeof v !== 'string' || !v.trim()) throw new AppError('invalid_input', `${name}을(를) 적어 주세요`);
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (s.length > max) throw new AppError('invalid_input', `${name}은(는) ${max}자까지`);
  return s;
};

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

function checkAction(a, { pathCheck }) {
  if (!a || typeof a !== 'object') throw new AppError('invalid_input', '할 일(action)이 필요함');
  switch (a.type) {
    case 'ask': return { type: 'ask', text: text(a.text, 300, '물어볼 말') };
    case 'open':
      if (!OPEN_VIEWS.includes(a.view)) throw new AppError('invalid_input', `열 화면은 ${OPEN_VIEWS.join('·')} 중 하나`);
      return { type: 'open', view: a.view };
    case 'voice': case 'stop': case 'briefing': return { type: a.type };
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
    default: throw new AppError('invalid_input', `모르는 할 일 종류: ${String(a.type).slice(0, 20)}`);
  }
}

export function validateButtons(list, { pathCheck = checkAppPath } = {}) {
  if (!Array.isArray(list)) throw new AppError('invalid_input', 'buttons는 목록이어야 함');
  if (list.length > MAX_BUTTONS) throw new AppError('invalid_input', `버튼은 ${MAX_BUTTONS}개까지`);
  const seen = new Set();
  return list.map((b) => {
    if (!b || typeof b !== 'object') throw new AppError('invalid_input', '버튼 형식이 아님');
    const id = typeof b.id === 'string' && /^[a-z0-9-]{1,24}$/.test(b.id) ? b.id : `b-${randomBytes(4).toString('hex')}`;
    if (seen.has(id)) throw new AppError('invalid_input', '같은 버튼 번호가 두 번 있음');
    seen.add(id);
    return {
      id,
      label: text(b.label, 20, '버튼 이름'),
      icon: ICONS.includes(b.icon) ? b.icon : 'star',
      color: COLORS.includes(b.color) ? b.color : 'orange',
      action: checkAction(b.action, { pathCheck }),
    };
  });
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class Shortcuts {
  // runner: PC 조작을 실제로 하는 것(pc-runner.js). 검사에서는 가짜.
  constructor({ settings, runner, pathCheck = checkAppPath }) {
    Object.assign(this, { settings, runner, pathCheck });
    this.lastPress = null;
    this.running = new Set();
  }

  list() {
    const saved = this.settings.get(KEY, null);
    return {
      buttons: Array.isArray(saved) ? saved : defaultButtons(),
      custom: Array.isArray(saved),
      icons: ICONS,
      colors: COLORS,
      views: OPEN_VIEWS,
      pcSupported: Boolean(this.runner?.supported),
      appTypes: APP_EXT,
      lastPress: this.lastPress,
    };
  }

  // 목록 통째로 저장. local=false(다른 기기)면 PC 조작 버튼을 새로 만들거나 바꿀 수 없다(그대로 두기·지우기·순서 바꾸기는 됨).
  save(list, { local = false } = {}) {
    const before = new Map(this.list().buttons.map((b) => [b.id, b]));
    // 다른 기기가 보낸 PC 조작 버튼은 경로를 다시 확인하지 않고 저장된 것과 같은지만 본다.
    const next = validateButtons(list, { pathCheck: local ? this.pathCheck : (p) => text(p, 400, '프로그램 경로') });
    if (!local) {
      for (const b of next) {
        if (!PC_ACTIONS.includes(b.action.type)) continue;
        const old = before.get(b.id);
        if (!old || !same(old.action, b.action)) throw new AppError('pc_local_only', 'PC 조작 버튼은 이 PC 화면(127.0.0.1)에서만 만들고 고칠 수 있어요');
      }
    }
    this.settings.set(KEY, next);
    return this.list();
  }

  reset() {
    this.settings.set(KEY, null);
    return this.list();
  }

  // 누르기. 화면 안 일이면 무엇을 할지만 돌려준다. PC 조작이면 여기서 한다(같은 버튼은 끝날 때까지 한 번만).
  async press(id) {
    const b = this.list().buttons.find((x) => x.id === id);
    if (!b) throw new AppError('not_found', '그 버튼이 없어요');
    if (!PC_ACTIONS.includes(b.action.type)) return { id, client: true, action: b.action };
    if (!this.runner?.supported) throw new AppError('not_configured', '이 PC에서는 PC 조작을 지원하지 않아요');
    if (this.running.has(id)) throw new AppError('invalid_state', '아직 앞에서 누른 일을 하는 중이에요');
    this.running.add(id);
    try {
      if (b.action.type === 'pc-app') await this.runner.openApp(this.pathCheck(b.action.path), b.action.args);
      else if (b.action.type === 'pc-keys') await this.runner.sendKeys(b.action.keys);
      else await this.runner.openUrl(checkUrl(b.action.url));
      this.lastPress = { id, label: b.label, at: new Date().toISOString(), ok: true };
      return { id, client: false, done: true };
    } catch (e) {
      this.lastPress = { id, label: b.label, at: new Date().toISOString(), ok: false };
      if (e instanceof AppError) throw e;
      throw new AppError('shortcut_failed', `PC에서 하지 못했어요: ${e.message}`);
    } finally {
      this.running.delete(id);
    }
  }
}
