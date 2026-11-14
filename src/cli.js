#!/usr/bin/env node
// 로컬 CLI. 계약: specs/001-jarvis-hybrid/contracts/cli.md
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { openDb, compactDb } from './store/db.js';
import { MissionControl } from './mission/missions.js';
import { defaultExecutors, searchExecutors } from './mission/executors.js';
import { QuickActions, defaultQuickActions, searchQuickActions } from './quick/quickActions.js';
import { MeetingStore } from './meeting/meetings.js';
import { MemoryStore } from './memory/memory.js';
import { ProviderRegistry } from './providers/registry.js';
import { createMockProvider } from './providers/mock.js';
import { Conversation, createTransferExecutor, TRANSFER_KIND } from './conversation/transfer.js';
import { AppError } from './errors.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 사용자가 직접 만든 키 파일. 값은 출력하지 않는다.
const ENV_FILE = join(ROOT, '.env.local');
if (!process.env.JARVIS_NO_ENV_FILE && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  const params = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new AppError('invalid_input', `--${key} 값 없음`);
      i += 1;
      if (key === 'param') {
        const eq = value.indexOf('=');
        if (eq < 1) throw new AppError('invalid_input', '--param은 k=v 형식');
        params[value.slice(0, eq)] = value.slice(eq + 1);
      } else {
        flags[key] = value;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags, params };
}

function toId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AppError('invalid_input', `잘못된 ID: ${value}`);
  return id;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('invalid_input', '--content는 JSON이어야 함');
  }
}

function tagsOf(flags) {
  return flags.tags === undefined ? undefined : flags.tags.split(',').map((t) => t.trim()).filter(Boolean);
}

async function run(argv) {
  const { positional, flags, params } = parseArgs(argv);
  const [area, cmd, ...rest] = positional;
  const dbPath = flags.db ?? process.env.JARVIS_DB ?? join(ROOT, 'data', 'jarvis.db');
  // 옛 DB 정리(T163): 없는 DB를 새로 만들지 않는다.
  if (area === 'db' && cmd === 'compact' && !existsSync(dbPath)) throw new AppError('not_found', `DB 파일 없음: ${dbPath}`);
  const db = openDb(dbPath);
  try {
    if (area === 'db' && cmd === 'compact') return { db: dbPath, ...compactDb(db, dbPath) };
    const memory = new MemoryStore(db);
    const providers = ProviderRegistry.fromEnv({ env: process.env });
    providers.providers.mock = createMockProvider('mock');
    // 회의 원음 폴더는 화면 실행과 같은 곳(DB 옆 meetings/). CLI 검색은 읽기만 한다.
    const meetings = new MeetingStore(db, { audioDir: join(dirname(dbPath), 'meetings') });
    const missions = new MissionControl(db, {
      executors: { ...defaultExecutors(), ...searchExecutors({ memory, meetings }), [TRANSFER_KIND]: createTransferExecutor({ memory, providers }) },
    });
    const quick = new QuickActions(missions, { ...defaultQuickActions(), ...searchQuickActions({ memory, meetings }) });
    const chat = new Conversation({ missions, memory, providers });

    if (area === 'mission') {
      switch (cmd) {
        case 'create':
          return missions.create({
            kind: flags.kind,
            title: flags.title,
            target: flags.target,
            impact: flags.impact,
            content: flags.content === undefined ? {} : parseJson(flags.content),
          });
        case 'list': return missions.list({ status: flags.status });
        case 'show': {
          const m = missions.get(toId(rest[0]));
          const extra = m.kind === TRANSFER_KIND ? { preview: chat.preview(m.id) } : {};
          return { ...m, ...extra, events: missions.events(m.id) };
        }
        case 'approve': return missions.approve(toId(rest[0]), flags.version);
        case 'reject': return missions.reject(toId(rest[0]));
        case 'cancel': return missions.cancel(toId(rest[0]));
        case 'update':
          return missions.update(toId(rest[0]), {
            title: flags.title,
            target: flags.target,
            impact: flags.impact,
            content: flags.content === undefined ? undefined : parseJson(flags.content),
          });
        case 'run': return await missions.execute(toId(rest[0]));
        case 'recover': return { interrupted: missions.recoverInterrupted() };
        default: break;
      }
    } else if (area === 'memory') {
      switch (cmd) {
        case 'add': return memory.add(rest.join(' '), tagsOf(flags) ?? []);
        case 'list': return memory.list();
        case 'get': return memory.get(toId(rest[0]));
        case 'search': return memory.search(rest.join(' '));
        case 'update': return memory.update(toId(rest[0]), rest.slice(1).join(' '), tagsOf(flags));
        case 'delete': return memory.delete(toId(rest[0]));
        default: break;
      }
    } else if (area === 'chat' && cmd === 'ask') {
      return await chat.ask({
        provider: flags.provider,
        question: rest.join(' '),
        memoryIds: flags.memory === undefined ? [] : flags.memory.split(',').map(toId),
        model: flags.model,
      });
    } else if (area === 'quick') {
      if (cmd === 'list') return quick.list();
      if (cmd === 'run') return quick.request(rest[0], params);
    }
    throw new AppError('invalid_input', '알 수 없는 명령. contracts/cli.md 참고');
  } finally {
    db.close();
  }
}

try {
  const out = await run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(out)}\n`);
} catch (e) {
  process.stdout.write(`${JSON.stringify({ error: { code: e.code ?? 'internal', message: e.message } })}\n`);
  process.exitCode = 1;
}
