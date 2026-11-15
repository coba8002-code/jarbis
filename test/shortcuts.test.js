// 단축키 판 검사. PC 조작은 가짜 실행기로만 확인한다(실제 프로그램·키 보내기 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { dirname } from 'node:path';
import { request as httpRequest } from 'node:http';
import { Shortcuts, validateButtons, defaultButtons, checkAppPath, checkUrl, MAX_BUTTONS } from '../src/shortcuts/shortcuts.js';
import { parseKeys, windowsKeyScript, macKeyScript, createPcRunner } from '../src/shortcuts/pc-runner.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { Settings } from '../src/store/settings.js';
import { openDb } from '../src/store/db.js';
import { tempDbPath } from './helpers.js';

const fakeRunner = () => {
  const did = [];
  return { supported: true, did, openApp: async (p, a) => { did.push(['app', p, a]); }, sendKeys: async (k) => { did.push(['keys', k]); }, openUrl: async (u) => { did.push(['url', u]); }, typeText: async (x) => { did.push(['text', x]); } };
};
const anyPath = (p) => p; // 검사용: 경로 있는지 보지 않음
const store = (runner = fakeRunner()) => {
  const db = openDb(tempDbPath());
  return { s: new Shortcuts({ settings: new Settings(db), runner, pathCheck: anyPath, sleep: async (ms) => { runner.did?.push(['wait', ms]); } }), runner, db };
};

test('처음에는 기본 버튼(화면 안 일만)을 보여 준다', (t) => {
  const { s, db } = store();
  t.after(() => db.close());
  const l = s.list();
  assert.equal(l.custom, false);
  assert.deepEqual(l.buttons, defaultButtons());
  assert.ok(l.buttons.every((b) => !b.action.type.startsWith('pc-')));
  assert.ok(l.icons.includes('calendar'));
});

test('버튼 확인: 이름·할 일을 검사하고, 모르는 아이콘·색은 기본으로, 번호가 없으면 새로 붙인다', () => {
  const [b] = validateButtons([{ label: '  유튜브  ', icon: 'nope', color: 'neon', action: { type: 'pc-url', url: 'https://www.youtube.com' } }], { pathCheck: anyPath });
  assert.equal(b.label, '유튜브');
  assert.equal(b.icon, 'star');
  assert.equal(b.color, 'orange');
  assert.match(b.id, /^b-[0-9a-f]{8}$/);
  const bad = [
    [{ label: '', action: { type: 'stop' } }],
    [{ label: 'x'.repeat(21), action: { type: 'stop' } }],
    [{ label: 'a', action: { type: 'rm-rf' } }],
    [{ label: 'a', action: { type: 'open', view: 'admin' } }],
    [{ label: 'a', action: { type: 'ask', text: '' } }],
    [{ label: 'a', action: { type: 'pc-url', url: 'file:///C:/Windows' } }],
    [{ label: 'a', action: { type: 'pc-url', url: 'javascript:alert(1)' } }],
    [{ label: 'a', action: { type: 'pc-keys', keys: 'ctrl+shift' } }],
    [{ label: 'a', action: { type: 'pc-app', path: 'C:\\a.exe', args: Array(9).fill('x') } }],
    [{ id: 'same', label: 'a', action: { type: 'stop' } }, { id: 'same', label: 'b', action: { type: 'stop' } }],
    Array.from({ length: MAX_BUTTONS + 1 }, (_, i) => ({ label: `b${i}`, action: { type: 'stop' } })),
  ];
  for (const list of bad) assert.throws(() => validateButtons(list, { pathCheck: anyPath }), { code: 'invalid_input' }, JSON.stringify(list).slice(0, 80));
});

test('프로그램 경로: 전체 경로·있는 파일·허용한 종류만(스크립트는 안 됨)', () => {
  const yes = { exists: () => true, isFile: () => true };
  assert.equal(checkAppPath('C:\\Program Files\\App\\app.exe', { ...yes, platform: 'win32' }), 'C:\\Program Files\\App\\app.exe');
  assert.equal(checkAppPath('C:\\Users\\me\\Desktop\\게임.lnk', { ...yes, platform: 'win32' }), 'C:\\Users\\me\\Desktop\\게임.lnk');
  assert.equal(checkAppPath('/Applications/Safari.app', { ...yes, platform: 'darwin' }), '/Applications/Safari.app');
  for (const p of ['app.exe', 'C:\\x\\run.bat', 'C:\\x\\a.ps1', 'C:\\x\\a.cmd', 'C:\\x\\..\\y\\a.exe', '\\\\server\\share\\a.exe']) {
    assert.throws(() => checkAppPath(p, { ...yes, platform: 'win32' }), { code: 'invalid_input' }, p);
  }
  assert.throws(() => checkAppPath('C:\\none\\a.exe', { exists: () => false, isFile: () => false, platform: 'win32' }), /없어요/);
  assert.equal(checkUrl('https://www.youtube.com'), 'https://www.youtube.com/');
});

test('단축키 읽기: 보조 키 + 보통 키 하나, 다른 이름도 알아듣는다', () => {
  assert.deepEqual(parseKeys('Ctrl + Shift + M'), { mods: ['ctrl', 'shift'], key: 'm' });
  assert.deepEqual(parseKeys('cmd+space'), { mods: ['win'], key: 'space' });
  assert.deepEqual(parseKeys('volup'), { mods: [], key: 'volumeup' });
  assert.deepEqual(parseKeys('alt+f4'), { mods: ['alt'], key: 'f4' });
  for (const bad of ['', 'ctrl+shift', 'ctrl+a+b', 'ctrl+%', 'ctrl+"; rm -rf']) assert.throws(() => parseKeys(bad), { code: 'invalid_input' }, bad);
});

test('PC 스크립트에는 숫자 코드만 들어간다(Windows keybd_event · Mac key code)', () => {
  const w = windowsKeyScript(parseKeys('ctrl+shift+m'));
  assert.match(w, /\$v=@\(0x11,0x10,0x4d\); \$x=@\(0,0,0\)/);
  assert.match(windowsKeyScript(parseKeys('win+up')), /\$v=@\(0x5b,0x26\); \$x=@\(1,1\)/);
  assert.equal(macKeyScript(parseKeys('cmd+shift+4')), 'tell application "System Events" to key code 21 using {command down, shift down}');
  assert.throws(() => macKeyScript(parseKeys('volumeup')), /Mac에서는/);
});

test('PC 실행기: 쉘 없이 인자 목록으로 띄운다', async () => {
  const spawned = [];
  const spawnImpl = (cmd, args, opts) => {
    spawned.push({ cmd, args, opts });
    const c = new EventEmitter();
    c.unref = () => {};
    c.kill = () => {};
    setImmediate(() => { c.emit('spawn'); c.emit('close', 0); });
    return c;
  };
  const win = createPcRunner({ platform: 'win32', spawnImpl });
  await win.openApp('C:\\Apps\\a.exe', ['--x']);
  await win.openApp('C:\\Users\\me\\Desktop\\b.lnk');
  await win.openUrl('https://example.com/?a=1&b=2');
  await win.sendKeys('ctrl+c');
  assert.deepEqual(spawned.map((s) => [s.cmd, s.args.slice(0, 2)]), [
    ['C:\\Apps\\a.exe', ['--x']],
    ['explorer.exe', ['C:\\Users\\me\\Desktop\\b.lnk']],
    ['rundll32.exe', ['url.dll,FileProtocolHandler', 'https://example.com/?a=1&b=2']],
    ['powershell.exe', ['-NoProfile', '-NonInteractive']],
  ]);
  assert.ok(spawned.every((s) => !s.opts.shell));
  assert.equal(spawned[3].opts.windowsHide, true);
  const mac = createPcRunner({ platform: 'darwin', spawnImpl });
  await mac.openApp('/Applications/Notes.app', ['a']);
  assert.deepEqual(spawned.at(-1).args, ['-a', '/Applications/Notes.app', '--args', 'a']);
  assert.equal(createPcRunner({ platform: 'linux', spawnImpl }).supported, false);
});

test('누르기: 화면 안 일은 할 일만 돌려주고, PC 조작은 실행기로 한다', async (t) => {
  const { s, runner, db } = store();
  t.after(() => db.close());
  s.save([
    { id: 'ask', label: '날씨', icon: 'sun', color: 'teal', action: { type: 'ask', text: '오늘 날씨 어때?' } },
    { id: 'yt', label: '유튜브', icon: 'globe', color: 'pink', action: { type: 'pc-url', url: 'https://www.youtube.com' } },
    { id: 'mute', label: '음소거', icon: 'mute', color: 'gray', action: { type: 'pc-keys', keys: 'Mute' } },
    { id: 'note', label: '메모장', icon: 'app', color: 'blue', action: { type: 'pc-app', path: 'C:\\Windows\\notepad.exe' } },
  ], { local: true });
  assert.deepEqual(await s.press('ask'), { id: 'ask', client: true, hold: false, action: { type: 'ask', text: '오늘 날씨 어때?' } });
  assert.equal(runner.did.length, 0);
  await s.press('yt');
  await s.press('mute');
  await s.press('note');
  assert.deepEqual(runner.did, [['url', 'https://www.youtube.com/'], ['keys', 'mute'], ['app', 'C:\\Windows\\notepad.exe', []]]);
  assert.equal(s.list().lastPress.label, '메모장');
  await assert.rejects(() => s.press('none'), { code: 'not_found' });
});

test('다른 기기 화면: PC 조작 버튼은 새로 만들거나 바꿀 수 없고, 그대로 두기·지우기·순서 바꾸기·화면 안 버튼은 된다', (t) => {
  const { s, db } = store();
  t.after(() => db.close());
  const pc = { id: 'yt', label: '유튜브', icon: 'globe', color: 'pink', action: { type: 'pc-url', url: 'https://www.youtube.com/' } };
  const ask = { id: 'ask', label: '날씨', icon: 'sun', color: 'teal', action: { type: 'ask', text: '날씨?' } };
  assert.throws(() => s.save([pc], { local: false }), { code: 'pc_local_only' });
  s.save([pc], { local: true });
  s.save([ask, pc], { local: false });
  assert.deepEqual(s.list().buttons.map((b) => b.id), ['ask', 'yt']);
  s.save([ask, { ...pc, label: '유튜브 열기', color: 'blue' }], { local: false });
  assert.throws(() => s.save([ask, { ...pc, action: { type: 'pc-url', url: 'https://evil.example/' } }], { local: false }), { code: 'pc_local_only' });
  assert.throws(() => s.save([ask, { id: 'new', label: '키', action: { type: 'pc-keys', keys: 'ctrl+c' } }], { local: false }), { code: 'pc_local_only' });
  s.save([ask], { local: false });
  assert.deepEqual(s.list().buttons.map((b) => b.id), ['ask']);
  assert.equal(s.reset().custom, false);
});

test('같은 PC 조작 버튼은 끝날 때까지 한 번만 실행한다', async (t) => {
  let release;
  const runner = { supported: true, openUrl: () => new Promise((r) => { release = r; }) };
  const { s, db } = store(runner);
  t.after(() => db.close());
  s.save([{ id: 'yt', label: 'yt', action: { type: 'pc-url', url: 'https://a.example' } }], { local: true });
  const first = s.press('yt');
  await assert.rejects(() => s.press('yt'), { code: 'invalid_state' });
  release();
  await first;
  const unsupported = store({ supported: false });
  t.after(() => unsupported.db.close());
  unsupported.s.save([{ id: 'yt', label: 'yt', action: { type: 'pc-url', url: 'https://a.example' } }], { local: true });
  await assert.rejects(() => unsupported.s.press('yt'), { code: 'not_configured' });
});

test('화면 서버: 이 PC 주소에서만 PC 조작 버튼을 만들고, 누르기는 어디서든 된다', async (t) => {
  const runner = fakeRunner();
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), pcRunner: runner, shortcutPathCheck: anyPath });
  const app = createAppServer(services);
  const { port } = await app.listen(0, { host: '192.0.2.10' });
  t.after(async () => { await app.close(); services.close(); });
  const call = (method, path, body, host = `127.0.0.1:${port}`) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { host, 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject); if (data) rq.write(data); rq.end();
  });
  const lan = `192.0.2.10:${port}`;
  const list = await call('GET', '/api/shortcuts', null, lan);
  assert.equal(list.json.local, false);
  assert.equal(list.json.buttons.length, 6);
  const pc = { id: 'yt', label: '유튜브', icon: 'globe', color: 'pink', action: { type: 'pc-url', url: 'https://www.youtube.com/' } };
  assert.equal((await call('PUT', '/api/shortcuts', { buttons: [pc] }, lan)).status, 403);
  const saved = await call('PUT', '/api/shortcuts', { buttons: [pc] });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.local, true);
  assert.equal((await call('POST', '/api/shortcuts/yt/press', {}, lan)).json.done, true);
  assert.deepEqual(runner.did, [['url', 'https://www.youtube.com/']]);
  assert.equal((await call('POST', '/api/shortcuts/../press', {})).status, 404);
  assert.equal((await call('POST', '/api/shortcuts/reset', {}, lan)).json.custom, false);
});
