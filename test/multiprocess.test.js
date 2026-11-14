import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/store/db.js';
import { MissionControl } from '../src/mission/missions.js';
import { tempDbPath } from './helpers.js';

const pexec = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('별도 프로세스 8개가 동시에 실행해도 한 번만 실행된다', async (t) => {
  const path = tempDbPath(t);
  const db = openDb(path);
  const mc = new MissionControl(db);
  const m = mc.create({ kind: 'mock.echo', title: '동시', target: 'local:mock', content: { n: 1 }, impact: '없음' });
  mc.approve(m.id, m.content_version);
  db.close();

  const runs = await Promise.all(Array.from({ length: 8 }, () => pexec(process.execPath, [CLI, '--db', path, 'mission', 'run', String(m.id)])
    .then(({ stdout }) => JSON.parse(stdout))
    .catch((e) => JSON.parse(e.stdout))));
  assert.equal(runs.filter((r) => r.status === 'done').length, 1);
  assert.equal(runs.filter((r) => r.error?.code === 'invalid_state').length, 7);

  const db2 = openDb(path);
  t.after(() => db2.close());
  const events = new MissionControl(db2).events(m.id).filter((e) => e.to_status === 'running');
  assert.equal(events.length, 1);
});
