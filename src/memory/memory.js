import { AppError } from '../errors.js';
import { nowIso, scrub } from '../store/db.js';
import { looksLikeSecret } from '../security/secrets.js';

function validate(content, tags) {
  if (typeof content !== 'string' || content.trim() === '') {
    throw new AppError('invalid_input', '기억 내용이 비어 있음');
  }
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
    throw new AppError('invalid_input', '태그는 글자 목록이어야 함');
  }
  if (looksLikeSecret(content) || tags.some(looksLikeSecret)) {
    throw new AppError('rejected_secret', '비밀 키처럼 보이는 값은 기억에 저장하지 않음');
  }
}

function toEntry(row) {
  return { ...row, tags: JSON.parse(row.tags) };
}

export class MemoryStore {
  constructor(db) {
    this.db = db;
  }

  add(content, tags = []) {
    validate(content, tags);
    const at = nowIso();
    const res = this.db.prepare(
      'INSERT INTO memories (content, tags, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run(content.trim(), JSON.stringify(tags), at, at);
    return this.get(Number(res.lastInsertRowid));
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
    if (!row) throw new AppError('not_found', `기억 ${id} 없음`);
    return toEntry(row);
  }

  list() {
    return this.db.prepare('SELECT * FROM memories ORDER BY id').all().map(toEntry);
  }

  search(text) {
    if (typeof text !== 'string' || text.trim() === '') return [];
    const like = `%${text.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db.prepare(
      "SELECT * FROM memories WHERE content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' ORDER BY id",
    ).all(like, like).map(toEntry);
  }

  update(id, content, tags) {
    const current = this.get(id);
    const nextTags = tags ?? current.tags;
    validate(content, nextTags);
    this.db.prepare('UPDATE memories SET content = ?, tags = ?, updated_at = ? WHERE id = ?')
      .run(content.trim(), JSON.stringify(nextTags), nowIso(), id);
    scrub(this.db);
    return this.get(id);
  }

  // 실제 행을 지운다.
  delete(id) {
    const res = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    if (res.changes !== 1) throw new AppError('not_found', `기억 ${id} 없음`);
    scrub(this.db);
    return { id, deleted: true };
  }
}
