import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppError } from '../errors.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  target TEXT NOT NULL,
  content TEXT NOT NULL,
  impact TEXT NOT NULL,
  content_version TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_version TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mission_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL REFERENCES missions(id),
  at TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  duration_ms INTEGER,
  audio_file TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  voice TEXT,
  assets TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transcript_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  text TEXT NOT NULL
);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  // 지운 내용을 0으로 덮어써 파일에 원문이 남지 않게 한다(헌법 III: 삭제는 실제 저장소에서).
  db.exec('PRAGMA secure_delete = ON;');
  db.exec(SCHEMA);
  // 2026-11-14(T249): 캐릭터 얼굴(look) 열. 예전에 만든 DB에는 없으므로 없을 때만 더한다(기존 자료 유지).
  const cols = db.prepare('PRAGMA table_info(characters)').all().map((c) => c.name);
  if (!cols.includes('look')) db.exec('ALTER TABLE characters ADD COLUMN look TEXT');
  return db;
}

// 개인 자료를 지우거나 고친 뒤 부른다. WAL에 남은 옛 내용을 본 파일에 반영하고 WAL을 비운다.
// 다른 연결이 읽는 중이면 다 못 비울 수 있다(결과의 busy가 1). 다음 정리 때 다시 비운다.
export function scrub(db) {
  try {
    return db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  } catch {
    return null;
  }
}

// 옛 DB 정리(T163). secure_delete를 켜기 전(2026-11-13 T160 이전)에 만든 DB는 지운 자료의 원문이
// 빈 페이지에 남아 있을 수 있다. DB를 새로 써서(VACUUM) 빈 페이지를 없애고 WAL을 비운다.
// 다른 프로그램(켜 둔 JARVIS 등)이 이 DB를 쓰는 중이면 다 못 비울 수 있어 clean:false로 알린다.
// DB 크기만큼 빈 디스크 공간이 더 필요하다.
export function compactDb(db, path) {
  const stat = () => ({
    pages: Number(db.prepare('PRAGMA page_count').get().page_count),
    freePages: Number(db.prepare('PRAGMA freelist_count').get().freelist_count),
    bytes: existsSync(path) ? statSync(path).size : 0,
  });
  const before = stat();
  try {
    db.exec('VACUUM');
  } catch (e) {
    if (/busy|locked/i.test(e.message)) throw new AppError('invalid_state', 'DB를 다른 프로그램이 쓰는 중임. JARVIS를 끈 뒤 다시 실행하세요.');
    throw new AppError('storage_error', `DB 정리 실패: ${e.message}`);
  }
  const cp = scrub(db);
  const walLeft = existsSync(`${path}-wal`) ? statSync(`${path}-wal`).size : 0;
  const clean = Boolean(cp) && Number(cp.busy) === 0 && walLeft === 0;
  return { before, after: stat(), walBytes: walLeft, clean, ...(clean ? {} : { hint: 'JARVIS를 끈 뒤 다시 실행하세요.' }) };
}

export function nowIso() {
  return new Date().toISOString();
}
