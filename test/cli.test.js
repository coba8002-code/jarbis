import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tempDbPath } from './helpers.js';

const pexec = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

// 검사에서는 사용자의 .env.local과 키를 읽지 않고, 외부 전송 허용도 끈다.
const SAFE_ENV = { ...process.env, JARVIS_NO_ENV_FILE: '1' };
for (const k of ['JARVIS_ALLOW_REMOTE', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY']) delete SAFE_ENV[k];

async function cli(db, ...args) {
  try {
    const { stdout } = await pexec(process.execPath, [CLI, '--db', db, ...args], { env: SAFE_ENV });
    return { code: 0, out: JSON.parse(stdout) };
  } catch (e) {
    return { code: e.code, out: JSON.parse(e.stdout) };
  }
}

test('CLI: Quick Action → 승인 → 1회 실행 흐름', async (t) => {
  const db = tempDbPath(t);
  const created = await cli(db, 'quick', 'run', 'echo', '--param', 'text=안녕');
  assert.equal(created.out.status, 'pending');
  const id = String(created.out.id);

  const early = await cli(db, 'mission', 'run', id);
  assert.equal(early.code, 1);
  assert.equal(early.out.error.code, 'approval_required');

  const shown = await cli(db, 'mission', 'show', id);
  const approved = await cli(db, 'mission', 'approve', id, '--version', shown.out.content_version);
  assert.equal(approved.out.status, 'approved');

  const ran = await cli(db, 'mission', 'run', id);
  assert.equal(ran.out.status, 'done');
  assert.deepEqual(ran.out.result, { echoed: { text: '안녕' } });

  const again = await cli(db, 'mission', 'run', id);
  assert.equal(again.out.error.code, 'invalid_state');
});

test('CLI: 내용 변경 후 이전 버전 승인 거부', async (t) => {
  const db = tempDbPath(t);
  const m = (await cli(db, 'mission', 'create', '--kind', 'mock.echo', '--title', 't', '--target', 'local:mock',
    '--impact', '없음', '--content', '{"a":1}')).out;
  await cli(db, 'mission', 'approve', String(m.id), '--version', m.content_version);
  const u = await cli(db, 'mission', 'update', String(m.id), '--content', '{"a":2}');
  assert.equal(u.out.status, 'pending');
  const old = await cli(db, 'mission', 'approve', String(m.id), '--version', m.content_version);
  assert.equal(old.out.error.code, 'version_mismatch');
});

test('CLI: 기억 CRUD', async (t) => {
  const db = tempDbPath(t);
  const a = (await cli(db, 'memory', 'add', '커피는', '아메리카노', '--tags', '취향,음료')).out;
  assert.deepEqual(a.tags, ['취향', '음료']);
  assert.equal((await cli(db, 'memory', 'search', '커피')).out.length, 1);
  assert.equal((await cli(db, 'memory', 'update', String(a.id), '차는', '녹차')).out.content, '차는 녹차');
  assert.deepEqual((await cli(db, 'memory', 'delete', String(a.id))).out, { id: a.id, deleted: true });
  assert.deepEqual((await cli(db, 'memory', 'list')).out, []);
  const secret = await cli(db, 'memory', 'add', `sk-${'a1B2'.repeat(8)}`);
  assert.equal(secret.out.error.code, 'rejected_secret');
});

test('CLI: 잘못된 명령은 오류 JSON과 종료 코드 1', async (t) => {
  const db = tempDbPath(t);
  const r = await cli(db, 'nope');
  assert.equal(r.code, 1);
  assert.equal(r.out.error.code, 'invalid_input');
});

test('CLI: 외부 공급자에 기억을 담으면 승인 대기, 승인해도 외부 허용 없으면 보내지 않음', async (t) => {
  const db = tempDbPath(t);
  const m = (await cli(db, 'memory', 'add', '아메리카노를', '좋아함')).out;
  const local = await cli(db, 'chat', 'ask', '--provider', 'mock', '--memory', String(m.id), '안녕');
  assert.equal(local.out.status, 'sent');

  const asked = await cli(db, 'chat', 'ask', '--provider', 'claude', '--memory', String(m.id), '음료', '추천');
  assert.equal(asked.out.status, 'approval_required');
  const id = String(asked.out.mission.id);
  const shown = await cli(db, 'mission', 'show', id);
  assert.match(shown.out.preview.request.messages[0].content, /아메리카노/);
  await cli(db, 'mission', 'approve', id, '--version', shown.out.content_version);
  const ran = await cli(db, 'mission', 'run', id);
  assert.equal(ran.out.status, 'failed');
  assert.match(ran.out.error, /not_configured/);
});
