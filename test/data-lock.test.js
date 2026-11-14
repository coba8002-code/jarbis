// 데이터 폴더 잠금(2026-11-14 독립 QA 결함): 같은 데이터 폴더로 두 번째 JARVIS를 켜면 포트 충돌로 꺼지기 전에
// 시작 복원이 첫 번째의 "녹음 중" 회의를 "중단"으로 바꿨다. 두 번째는 DB를 열거나 복원하기 전에 멈춰야 한다.
// 잠금은 OS 파일 잠금(SQLite BEGIN EXCLUSIVE)이라 동시에 켜도 하나만 잡고, 강제 종료되면 OS가 푼다.
// 실제 src/main.js 자식 프로세스로 확인한다(외부 전송·소리 없음). 자식마다 제한 시간 15초.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { acquireDataLock } from '../src/app/data-lock.js';
import { tempDbPath } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = join(ROOT, 'src', 'main.js');
const LOCK_MODULE = pathToFileURL(join(ROOT, 'src', 'app', 'data-lock.js')).href;
const ENV = { ...process.env, JARVIS_NO_ENV_FILE: '1', JARVIS_ALLOW_REMOTE: '0' };
const freePort = () => new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

// 띄운 자식은 모두 여기 모아, 검사가 실패해 중간에 빠져나가도 파일 끝에서 남김없이 끈다.
const live = new Set();
after(async () => { for (const c of [...live]) await kill(c); });

// 자식 프로세스를 띄워 끝나거나 readyText가 나올 때까지 기다린다(제한 시간 15초).
function run(args, { readyText } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: ENV, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    live.add(child);
    child.once('exit', () => live.delete(child));
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`제한 시간 초과: ${out}`)); }, 15000);
    const onData = (c) => { out += c; if (readyText && out.includes(readyText)) { clearTimeout(timer); resolve({ child, out, ready: true }); } };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', (e) => { clearTimeout(timer); reject(e); });
    child.once('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}
const runMain = (port, dataDir, opts) => run([MAIN, '--port', String(port), '--data', dataDir], opts);
// 신호로 끝난 자식은 exitCode가 null이고 signalCode가 있다. 둘 다 보고, 여러 번 불러도 같은 기다림을 돌려준다
// (이미 지난 exit를 다시 기다리면 끝나지 않음, 2026-11-14 독립 QA).
const kill = (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  child.stopping ??= new Promise((r) => { child.once('exit', r); child.kill(); });
  return child.stopping;
};

function start(dataDir) {
  const services = createServices({ dataDir, providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  return { services, app: createAppServer(services) };
}

test('같은 데이터 폴더의 두 번째 JARVIS는 같은 포트든 다른 포트든 복원하지 않고 끝난다', { timeout: 60000 }, async (t) => {
  const dataDir = dirname(tempDbPath());
  const first = start(dataDir);
  const { port } = await first.app.listen(0);
  t.after(async () => { await first.app.close(); first.services.close(); });
  const meeting = first.services.meetings.start('시험 녹음 중 회의');

  const samePort = await runMain(port, dataDir);
  assert.equal(samePort.code, 1);
  assert.match(samePort.out, /다른 JARVIS가 쓰는 중/);
  assert.equal(first.services.meetings.get(meeting.id).status, 'recording', '같은 포트: 첫 번째 녹음이 그대로');

  const otherPort = await runMain(await freePort(), dataDir);
  assert.equal(otherPort.code, 1);
  assert.match(otherPort.out, /다른 JARVIS가 쓰는 중/);
  assert.equal(first.services.meetings.get(meeting.id).status, 'recording', '다른 포트: 첫 번째 녹음이 그대로');
  assert.throws(() => acquireDataLock(dataDir), { code: 'data_in_use' }, '첫 번째가 여전히 잠금을 쥠');
});

test('정상 종료하면 바로 다음 실행이 시작되고, 강제 종료된 실행의 잠금은 OS가 풀어 다음 실행이 복원한다', { timeout: 60000 }, async (t) => {
  const dataDir = dirname(tempDbPath());
  const first = start(dataDir);
  const meeting = first.services.meetings.start('끊긴 녹음');
  first.services.close();

  const next = await runMain(await freePort(), dataDir, { readyText: '끄려면' });
  if (next.child) t.after(() => kill(next.child)); // 아래 확인이 실패해도 자식이 남지 않게
  assert.equal(next.ready, true, next.out);
  assert.match(next.out, /재시작 복원: 중단 처리한 작업 0개, 회의 1개/, '혼자 쓰는 폴더의 복원은 그대로 함');
  assert.throws(() => acquireDataLock(dataDir), { code: 'data_in_use' }, '실행 중에는 잠김');
  await kill(next.child); // 강제 종료

  const again = start(dataDir); // OS가 푼 잠금을 바로 잡는다
  assert.equal(again.services.meetings.get(meeting.id).status, 'interrupted');
  again.services.close();
});

test('다른 프로세스가 잠금을 쥐는 동안은 못 잡고, 그 프로세스가 강제 종료되면 잡힌다', { timeout: 60000 }, async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'jarvis-lock-'));
  const holder = await run(['--input-type=module', '-e', `import(${JSON.stringify(LOCK_MODULE)}).then((m) => { m.acquireDataLock(${JSON.stringify(dataDir)}); console.log('HELD'); setInterval(() => {}, 1000); })`], { readyText: 'HELD' });
  if (holder.child) t.after(() => kill(holder.child)); // 아래 확인이 실패해도 자식이 남지 않게
  assert.equal(holder.ready, true, holder.out);
  assert.throws(() => acquireDataLock(dataDir), { code: 'data_in_use' });
  await kill(holder.child);
  const mine = acquireDataLock(dataDir);
  mine.release();
});

test('같은 데이터 폴더로 main.js 두 개를 동시에 켜면 하나만 시작한다(5회)', { timeout: 120000 }, async () => {
  for (let i = 0; i < 5; i += 1) {
    const dataDir = mkdtempSync(join(tmpdir(), 'jarvis-simul-'));
    const both = await Promise.all([0, 1].map(() => runMain(0, dataDir, { readyText: '끄려면' })));
    const started = both.filter((x) => x.ready);
    const refused = both.filter((x) => x.code === 1 && /다른 JARVIS가 쓰는 중/.test(x.out));
    try {
      assert.equal(started.length, 1, `${i + 1}회: ${both.map((x) => x.out).join(' | ')}`);
      assert.equal(refused.length, 1);
    } finally {
      for (const x of started) await kill(x.child);
    }
  }
});

// 2026-11-14 독립 QA: 동시에 켠 두 실행이 모두 "쓰는 중"으로 끝나 아무도 시작 못 하는 일이 50회 중 2~3회 있었다
// (기다림 0이라 서로의 공유 잠금 때문에 둘 다 배타 잠금을 포기). 매 회 프로세스 4개가 같은 순간 잡고,
// 잡은 쪽은 모든 결과가 나올 때까지 쥔다. 그래서 잡은 수 = 동시에 쥔 수이고, 매 회 정확히 1이어야 한다.
test('같은 순간 4개 프로세스가 잠금을 잡으면 매번 정확히 하나만 쥔다(10회)', { timeout: 120000 }, async () => {
  for (let round = 0; round < 10; round += 1) {
    const dataDir = mkdtempSync(join(tmpdir(), 'jarvis-contend-'));
    const at = Date.now() + 700;
    const code = `const m = await import(${JSON.stringify(LOCK_MODULE)}); while (Date.now() < ${at}) {}
try { const l = m.acquireDataLock(${JSON.stringify(dataDir)}); console.log('GOT'); process.stdin.resume(); process.stdin.on('end', () => { l.release(); process.exit(0); }); }
catch (e) { console.log('REFUSED ' + e.code); process.exit(0); }`;
    const kids = [];
    const results = await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve) => {
      const c = spawn(process.execPath, ['--input-type=module', '-e', code], { env: ENV, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      kids.push(c);
      live.add(c);
      c.once('exit', () => live.delete(c));
      let out = '';
      const timer = setTimeout(() => resolve('TIMEOUT'), 15000);
      c.stdout.on('data', (d) => { out += d; if (out.includes('\n')) { clearTimeout(timer); resolve(out.split('\n')[0].trim()); } });
      c.once('exit', () => { clearTimeout(timer); resolve(out.split('\n')[0].trim() || 'EXIT'); });
    })));
    // 결과를 모두 받은 뒤에만 쥔 쪽을 놓게 한다(끝날 때까지 기다림, 남으면 파일 끝에서 끔)
    await Promise.all(kids.map((c) => (c.exitCode !== null || c.signalCode !== null ? null : new Promise((r) => { c.once('exit', r); c.stdin.end(); }))));
    assert.equal(results.filter((x) => x === 'GOT').length, 1, `${round + 1}회: ${results.join(' / ')}`);
    assert.equal(results.filter((x) => x === 'REFUSED data_in_use').length, 3, `${round + 1}회: ${results.join(' / ')}`);
  }
});
