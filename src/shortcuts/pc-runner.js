// 단축키 판의 PC 조작: 프로그램 열기 · 단축키 보내기 · 웹 주소 열기 · 글자 입력(클립보드에 넣고 붙여넣기). Windows·macOS.
// 쉘을 거치지 않는다(spawn에 인자 목록으로 넘김). 단축키는 정해 둔 키 이름만 받아 숫자 코드로 바꿔 넘긴다.
// 단축키는 지금 앞에 떠 있는 창으로 간다(스트림덱과 같은 방식).
import { spawn as nodeSpawn } from 'node:child_process';
import { AppError } from '../errors.js';

const MODS = { ctrl: 'ctrl', control: 'ctrl', shift: 'shift', alt: 'alt', option: 'alt', win: 'win', cmd: 'win', command: 'win', meta: 'win', super: 'win' };
const ALIAS = { return: 'enter', escape: 'esc', del: 'delete', pgup: 'pageup', pgdn: 'pagedown', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', prtsc: 'printscreen', volup: 'volumeup', voldown: 'volumedown', play: 'playpause', pause: 'playpause', previous: 'prev' };

// Windows 가상 키 번호. ext: 확장 키 표시가 필요한 키.
const WIN_VK = {
  ctrl: [0x11], shift: [0x10], alt: [0x12], win: [0x5b, 1],
  enter: [0x0d], esc: [0x1b], tab: [0x09], space: [0x20], backspace: [0x08], printscreen: [0x2c],
  delete: [0x2e, 1], insert: [0x2d, 1], home: [0x24, 1], end: [0x23, 1], pageup: [0x21, 1], pagedown: [0x22, 1],
  left: [0x25, 1], up: [0x26, 1], right: [0x27, 1], down: [0x28, 1],
  volumeup: [0xaf], volumedown: [0xae], mute: [0xad], playpause: [0xb3], next: [0xb0], prev: [0xb1],
};
for (let i = 0; i < 26; i += 1) WIN_VK[String.fromCharCode(97 + i)] = [0x41 + i];
for (let i = 0; i < 10; i += 1) WIN_VK[String(i)] = [0x30 + i];
for (let i = 1; i <= 24; i += 1) WIN_VK[`f${i}`] = [0x6f + i];

// macOS 키 코드(System Events key code). 소리·재생 같은 미디어 키는 System Events로 보낼 수 없어 뺐다.
const MAC_CODE = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
  1: 18, 2: 19, 3: 20, 4: 21, 6: 22, 5: 23, 9: 25, 7: 26, 8: 28, 0: 29, o: 31, u: 32, i: 34, p: 35, l: 37, j: 38, k: 40, n: 45, m: 46,
  enter: 36, tab: 48, space: 49, backspace: 51, esc: 53, delete: 117, home: 115, end: 119, pageup: 116, pagedown: 121,
  left: 123, right: 124, down: 125, up: 126,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
};
const MAC_MOD = { ctrl: 'control down', shift: 'shift down', alt: 'option down', win: 'command down' };

// "ctrl+shift+m" → { mods: ['ctrl','shift'], key: 'm' }. 모르는 키·키 없음·키 두 개는 거부.
export function parseKeys(input) {
  if (typeof input !== 'string' || !input.trim()) throw new AppError('invalid_input', '단축키를 적어 주세요(예: ctrl+shift+m)');
  const parts = input.toLowerCase().replace(/\s+/g, '').split('+').filter(Boolean);
  const mods = [];
  let key = null;
  for (const raw of parts) {
    if (MODS[raw]) { if (!mods.includes(MODS[raw])) mods.push(MODS[raw]); continue; }
    const k = ALIAS[raw] ?? raw;
    if (!WIN_VK[k]) throw new AppError('invalid_input', `모르는 키: ${raw.slice(0, 20)}`);
    if (key) throw new AppError('invalid_input', '보통 키는 하나만 적어 주세요(예: ctrl+shift+m)');
    key = k;
  }
  if (!key) throw new AppError('invalid_input', '보통 키가 하나 필요해요(예: ctrl+c의 c)');
  return { mods, key };
}

// Windows: keybd_event로 누르고 거꾸로 뗀다. 넘기는 값은 숫자뿐이다.
export function windowsKeyScript({ mods, key }) {
  const seq = [...mods, key].map((k) => WIN_VK[k]);
  const vks = seq.map(([v]) => `0x${v.toString(16)}`).join(',');
  const ext = seq.map(([, e]) => (e ? 1 : 0)).join(',');
  return [
    "$d='[DllImport(\"user32.dll\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'",
    "Add-Type -MemberDefinition $d -Name 'Kb' -Namespace 'JarvisKeys' | Out-Null",
    `$v=@(${vks}); $x=@(${ext})`,
    'for($i=0;$i -lt $v.Count;$i++){[JarvisKeys.Kb]::keybd_event([byte]$v[$i],0,[uint32]$x[$i],[UIntPtr]::Zero); Start-Sleep -Milliseconds 15}',
    'for($i=$v.Count-1;$i -ge 0;$i--){[JarvisKeys.Kb]::keybd_event([byte]$v[$i],0,[uint32]($x[$i] -bor 2),[UIntPtr]::Zero)}',
  ].join('; ');
}

// macOS: System Events key code. 손쉬운 사용 권한(자동화)이 필요하다.
export function macKeyScript({ mods, key }) {
  const code = MAC_CODE[key];
  if (code === undefined) throw new AppError('invalid_input', `Mac에서는 ${key} 키를 보낼 수 없어요`);
  const using = mods.length ? ` using {${mods.map((m) => MAC_MOD[m]).join(', ')}}` : '';
  return `tell application "System Events" to key code ${code}${using}`;
}

// 프로그램을 띄우고 시작됐는지만 확인한다(끝날 때까지 기다리지 않음).
function launch(spawnImpl, cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', (e) => reject(new AppError('shortcut_failed', `열지 못했어요(${e.code ?? e.message})`)));
    child.once('spawn', () => { child.unref?.(); resolve(); });
  });
}

// 끝날 때까지 기다린다(키 보내기). 10초 넘으면 끊는다. env: 더할 환경 변수, input: 표준 입력으로 넘길 글
function runToEnd(spawnImpl, cmd, args, { env = null, input = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(cmd, args, { stdio: [input === null ? 'ignore' : 'pipe', 'ignore', 'pipe'], windowsHide: true, ...(env ? { env: { ...process.env, ...env } } : {}) });
    if (input !== null) { child.stdin?.on?.('error', () => {}); child.stdin?.end?.(input); }
    let err = '';
    child.stderr?.on('data', (c) => { err = (err + c).slice(-300); });
    const timer = setTimeout(() => child.kill(), 10_000);
    child.once('error', (e) => { clearTimeout(timer); reject(new AppError('shortcut_failed', `단축키를 보내지 못했어요(${e.code ?? e.message})`)); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new AppError('shortcut_failed', `단축키를 보내지 못했어요(종료 ${code}${err ? `: ${err.trim().split('\n')[0].slice(0, 120)}` : ''})`));
    });
  });
}

export function createPcRunner({ platform = process.platform, spawnImpl = nodeSpawn } = {}) {
  const win = platform === 'win32';
  const mac = platform === 'darwin';
  return {
    supported: win || mac,
    platform,
    async openApp(path, args = []) {
      if (win) {
        const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
        if (ext === '.exe') return launch(spawnImpl, path, args);
        return launch(spawnImpl, 'explorer.exe', [path]); // 바로 가기(.lnk·.url)는 탐색기가 연다
      }
      if (mac) return launch(spawnImpl, 'open', ['-a', path, ...(args.length ? ['--args', ...args] : [])]);
      throw new AppError('not_configured', '이 OS에서는 프로그램 열기를 지원하지 않아요');
    },
    async sendKeys(keys) {
      const parsed = parseKeys(keys);
      if (win) return runToEnd(spawnImpl, 'powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsKeyScript(parsed)]);
      if (mac) return runToEnd(spawnImpl, 'osascript', ['-e', macKeyScript(parsed)]);
      throw new AppError('not_configured', '이 OS에서는 단축키 보내기를 지원하지 않아요');
    },
    // 글자 입력: 글을 클립보드에 넣고 ctrl+v(Mac cmd+v)로 붙인다. 글은 명령 줄에 넣지 않는다
    // (Windows는 환경 변수로, Mac은 표준 입력으로 넘김). 원래 클립보드 내용은 바뀐다.
    async typeText(text) {
      if (win) return runToEnd(spawnImpl, 'powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Set-Clipboard -Value $env:JARVIS_PASTE_TEXT; ${windowsKeyScript(parseKeys('ctrl+v'))}`], { env: { JARVIS_PASTE_TEXT: text } });
      if (mac) {
        await runToEnd(spawnImpl, 'pbcopy', [], { input: text });
        return runToEnd(spawnImpl, 'osascript', ['-e', macKeyScript(parseKeys('cmd+v'))]);
      }
      throw new AppError('not_configured', '이 OS에서는 글자 입력을 지원하지 않아요');
    },
    async openUrl(url) {
      if (win) return launch(spawnImpl, 'rundll32.exe', ['url.dll,FileProtocolHandler', url]);
      if (mac) return launch(spawnImpl, 'open', [url]);
      throw new AppError('not_configured', '이 OS에서는 웹 주소 열기를 지원하지 않아요');
    },
  };
}
