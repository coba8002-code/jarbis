// 단축키 판에 2026-11-15 더한 기능 검사(페이지 · 여러 동작 · 길게 누르기 · 실시간 버튼 · 글자 입력 · 누르기 전 확인).
// PC 조작은 가짜 실행기로만 확인한다(실제 프로그램·키·클립보드 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Shortcuts, validateButtons, validatePages, checkTypeText, createStatsReader, MAX_PAGES } from '../src/shortcuts/shortcuts.js';
import { createPcRunner } from '../src/shortcuts/pc-runner.js';
import { Settings } from '../src/store/settings.js';
import { openDb } from '../src/store/db.js';
import { tempDbPath } from './helpers.js';

const fakeRunner = () => {
  const did = [];
  return { supported: true, did, openApp: async (p, a) => { did.push(['app', p, a]); }, sendKeys: async (k) => { did.push(['keys', k]); }, openUrl: async (u) => { did.push(['url', u]); }, typeText: async (x) => { did.push(['text', x]); } };
};
const anyPath = (p) => p;
const store = (runner = fakeRunner()) => {
  const db = openDb(tempDbPath());
  return { s: new Shortcuts({ settings: new Settings(db), runner, pathCheck: anyPath, sleep: async (ms) => { runner.did.push(['wait', ms]); } }), runner, db };
};

test('페이지: 이름 12자·최대 개수, 없는 페이지 버튼은 첫 페이지로', (t) => {
  const { s, db } = store();
  t.after(() => db.close());
  assert.deepEqual(validatePages(undefined), [{ id: 'main', name: '기본' }]);
  for (const bad of [[], [{ name: '' }], [{ name: 'x'.repeat(13) }], Array.from({ length: MAX_PAGES + 1 }, (_, i) => ({ name: `p${i}` })), [{ id: 'a', name: '1' }, { id: 'a', name: '2' }]]) {
    assert.throws(() => validatePages(bad), { code: 'invalid_input' }, JSON.stringify(bad).slice(0, 60));
  }
  const l = s.save([
    { id: 'a', label: 'A', page: 'game', action: { type: 'stop' } },
    { id: 'b', label: 'B', page: 'nope', action: { type: 'stop' } },
  ], { local: false, pages: [{ id: 'main', name: '기본' }, { id: 'game', name: '게임' }] });
  assert.deepEqual(l.pages.map((p) => p.name), ['기본', '게임']);
  assert.deepEqual(l.buttons.map((b) => b.page), ['game', 'main']);
  const l2 = s.save(l.buttons, { local: false, pages: [{ id: 'main', name: '기본' }] });
  assert.deepEqual(l2.buttons.map((b) => b.page), ['main', 'main']);
  assert.equal(s.reset().pages.length, 1);
});

test('여러 동작: PC 칸·기다리기만, 칸 수·기다리는 시간 제한, 차례대로 하고 실패한 칸을 알려 준다', async (t) => {
  const { s, runner, db } = store();
  t.after(() => db.close());
  const ok = { type: 'multi', steps: [{ type: 'pc-app', path: 'C:\\obs.exe' }, { type: 'wait', ms: 1500 }, { type: 'pc-keys', keys: 'ctrl+F9' }, { type: 'pc-text', text: '방송 시작!' }] };
  const bad = [
    { type: 'multi', steps: [] },
    { type: 'multi', steps: Array(9).fill({ type: 'pc-keys', keys: 'a' }) },
    { type: 'multi', steps: [{ type: 'wait', ms: 500 }] },
    { type: 'multi', steps: [{ type: 'ask', text: '안녕' }] },
    { type: 'multi', steps: [{ type: 'multi', steps: [] }] },
    { type: 'multi', steps: [{ type: 'pc-keys', keys: 'a' }, { type: 'wait', ms: 50 }] },
    { type: 'multi', steps: [{ type: 'pc-keys', keys: 'a' }, { type: 'wait', ms: 10_000 }, { type: 'wait', ms: 6000 }] },
  ];
  for (const a of bad) assert.throws(() => validateButtons([{ label: 'x', action: a }], { pathCheck: anyPath }), { code: 'invalid_input' }, JSON.stringify(a).slice(0, 80));
  s.save([{ id: 'live', label: '방송 시작', action: ok }], { local: true });
  const r = await s.press('live');
  assert.equal(r.steps, 4);
  assert.deepEqual(runner.did, [['app', 'C:\\obs.exe', []], ['wait', 1500], ['keys', 'ctrl+f9'], ['text', '방송 시작!']]);
  runner.sendKeys = async () => { throw new Error('막힘'); };
  await assert.rejects(() => s.press('live'), (e) => e.code === 'shortcut_failed' && /3번째 칸/.test(e.message));
  assert.equal(s.list().lastPress.ok, false);
});

test('길게 누르기: 다른 동작을 하고, 없으면 알려 준다. 실시간 버튼과는 같이 못 쓴다', async (t) => {
  const { s, runner, db } = store();
  t.after(() => db.close());
  s.save([
    { id: 'vol', label: '소리', action: { type: 'pc-keys', keys: 'volumeup' }, hold: { type: 'pc-keys', keys: 'mute' } },
    { id: 'w', label: '날씨', action: { type: 'ask', text: '날씨?' }, hold: { type: 'open', view: 'briefing' } },
    { id: 'plain', label: '멈춤', action: { type: 'stop' } },
  ], { local: true });
  await s.press('vol');
  await s.press('vol', { hold: true });
  assert.deepEqual(runner.did, [['keys', 'volumeup'], ['keys', 'mute']]);
  assert.deepEqual(await s.press('w', { hold: true }), { id: 'w', client: true, hold: true, action: { type: 'open', view: 'briefing' } });
  await assert.rejects(() => s.press('plain', { hold: true }), { code: 'invalid_state' });
  assert.throws(() => validateButtons([{ label: 'c', action: { type: 'widget', kind: 'clock' }, hold: { type: 'stop' } }]), { code: 'invalid_input' });
  assert.throws(() => validateButtons([{ label: 'c', action: { type: 'stop' }, hold: { type: 'widget', kind: 'clock' } }]), { code: 'invalid_input' });
});

test('다른 기기 화면: 길게 누르기·여러 동작의 PC 조작도 새로 넣거나 바꿀 수 없다(그대로는 됨)', (t) => {
  const { s, db } = store();
  t.after(() => db.close());
  const b = { id: 'w', label: '날씨', action: { type: 'ask', text: '날씨?' } };
  assert.throws(() => s.save([{ ...b, hold: { type: 'pc-url', url: 'https://a.example/' } }], { local: false }), { code: 'pc_local_only' });
  s.save([{ ...b, hold: { type: 'pc-url', url: 'https://a.example/' } }], { local: true });
  s.save([{ ...b, label: '날씨 보기', hold: { type: 'pc-url', url: 'https://a.example/' } }], { local: false });
  assert.throws(() => s.save([{ ...b, hold: { type: 'pc-url', url: 'https://b.example/' } }], { local: false }), { code: 'pc_local_only' });
  assert.throws(() => s.save([{ id: 'm', label: 'm', action: { type: 'multi', steps: [{ type: 'pc-keys', keys: 'a' }] } }], { local: false }), { code: 'pc_local_only' });
  assert.throws(() => s.save([{ id: 't', label: 't', action: { type: 'pc-text', text: '안녕' } }], { local: false }), { code: 'pc_local_only' });
});

test('실시간 버튼·확인·글자 입력 검사', () => {
  const [clock, stats, sure] = validateButtons([
    { label: '시계', action: { type: 'widget', kind: 'clock' }, confirm: true },
    { label: 'PC', action: { type: 'widget', kind: 'pc-stats' } },
    { label: '끄기', action: { type: 'pc-keys', keys: 'alt+f4' }, confirm: true },
  ], { pathCheck: anyPath });
  assert.equal(clock.confirm, undefined);
  assert.equal(stats.action.kind, 'pc-stats');
  assert.equal(sure.confirm, true);
  assert.throws(() => validateButtons([{ label: 'x', action: { type: 'widget', kind: 'camera' } }]), { code: 'invalid_input' });
  assert.equal(checkTypeText('안녕\r\n하세요\u0007'), '안녕\n하세요');
  assert.throws(() => checkTypeText(' '), { code: 'invalid_input' });
  assert.throws(() => checkTypeText('x'.repeat(501)), { code: 'invalid_input' });
});

test('PC 상태 읽기: CPU는 두 번째부터, 메모리는 바로', () => {
  let n = 0;
  const cpusImpl = () => { n += 1; return [{ times: { user: 100 * n, sys: 0, idle: n === 1 ? 100 : 150, nice: 0, irq: 0 } }]; };
  const read = createStatsReader({ cpusImpl, total: () => 1000, free: () => 250 });
  assert.deepEqual({ ...read(), at: 0 }, { cpu: null, mem: 75, at: 0 });
  assert.equal(read().cpu, 67); // 바쁜 100 / 전체 150
});

test('글자 입력 실행기: 글은 명령 줄에 넣지 않는다(Windows 환경 변수, Mac 표준 입력)', async () => {
  const spawned = [];
  const spawnImpl = (cmd, args, opts) => {
    const c = new EventEmitter();
    c.stdin = { got: '', on() {}, end(x) { this.got = x; } };
    c.kill = () => {};
    spawned.push({ cmd, args, opts, c });
    setImmediate(() => c.emit('close', 0));
    return c;
  };
  const evil = '"; Remove-Item C:\\ -Recurse; $x="';
  await createPcRunner({ platform: 'win32', spawnImpl }).typeText(evil);
  assert.equal(spawned[0].cmd, 'powershell.exe');
  assert.ok(!spawned[0].args.join(' ').includes('Remove-Item'));
  assert.equal(spawned[0].opts.env.JARVIS_PASTE_TEXT, evil);
  assert.match(spawned[0].args.at(-1), /^Set-Clipboard -Value \$env:JARVIS_PASTE_TEXT; /);
  assert.ok(!spawned[0].opts.shell);
  await createPcRunner({ platform: 'darwin', spawnImpl }).typeText(evil);
  assert.equal(spawned[1].cmd, 'pbcopy');
  assert.equal(spawned[1].c.stdin.got, evil);
  assert.deepEqual(spawned[2].args, ['-e', 'tell application "System Events" to key code 9 using {command down}']);
});
