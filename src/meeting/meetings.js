// 회의 기록 (FR-008). 녹음 장치는 다루지 않고, 저장·시간 규칙·삭제·복원만 담는다.
// 시간 규칙:
//  - 녹취 시간(ms)은 녹음 시작 기준이다. 0 이상, 끝 > 시작.
//  - 순서가 뒤집히지 않는다: 새 구간의 시작은 앞 구간의 시작보다 앞설 수 없다.
//  - 음성 길이를 넘지 않는다: 녹음을 멈출 때 길이를 정하고, 끝이 길이를 넘는 구간은 길이로 자르고,
//    시작이 길이 이상인 구간은 지운다(지운 수를 돌려준다). 멈춘 뒤에 오는 구간도 같은 규칙을 따른다.
import { unlinkSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { AppError } from '../errors.js';
import { nowIso, scrub } from '../store/db.js';

function intMs(name, v) {
  if (!Number.isSafeInteger(v) || v < 0) throw new AppError('invalid_input', `${name}은(는) 0 이상 안전한 정수(ms)여야 함`);
  return v;
}

export class MeetingStore {
  // audioDir: 원음 파일을 두는 폴더. 삭제는 이 폴더 안 파일만 한다.
  constructor(db, { audioDir, fs = { unlinkSync, existsSync, writeFileSync, readFileSync } }) {
    this.db = db;
    this.audioDir = resolve(audioDir);
    this.fs = fs;
  }

  #row(id) {
    const row = this.db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
    if (!row) throw new AppError('not_found', `회의 ${id} 없음`);
    return row;
  }

  #inTx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // 원음 파일의 실제 경로. 저장 폴더 밖이면 거부한다.
  audioPath(id) {
    const p = resolve(this.audioDir, this.#row(id).audio_file);
    const rel = relative(this.audioDir, p);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new AppError('invalid_state', '원음 경로가 저장 폴더 밖임');
    return p;
  }

  // 녹음 시작. 동시에 두 개는 녹음하지 않는다.
  start(title) {
    if (typeof title !== 'string' || title.trim() === '') throw new AppError('invalid_input', '회의 이름이 비어 있음');
    return this.#inTx(() => {
      const busy = this.db.prepare("SELECT id FROM meetings WHERE status = 'recording'").get();
      if (busy) throw new AppError('invalid_state', `회의 ${busy.id}이(가) 이미 녹음 중`);
      const at = nowIso();
      const res = this.db.prepare(
        "INSERT INTO meetings (title, status, started_at, audio_file, created_at, updated_at) VALUES (?, 'recording', ?, '', ?, ?)",
      ).run(title.trim(), at, at, at);
      const id = Number(res.lastInsertRowid);
      this.db.prepare('UPDATE meetings SET audio_file = ? WHERE id = ?').run(`meeting-${id}.wav`, id);
      return this.get(id);
    });
  }

  get(id) {
    return this.#row(id);
  }

  list() {
    return this.db.prepare('SELECT * FROM meetings ORDER BY id').all();
  }

  recording() {
    return this.db.prepare("SELECT * FROM meetings WHERE status = 'recording'").get() ?? null;
  }

  // 녹취 구간 추가.
  addSegment(id, { startMs, endMs, text }) {
    intMs('startMs', startMs);
    intMs('endMs', endMs);
    if (endMs <= startMs) throw new AppError('invalid_input', '끝 시간은 시작 시간보다 커야 함');
    if (typeof text !== 'string' || text.trim() === '') throw new AppError('invalid_input', '녹취 글이 비어 있음');
    return this.#inTx(() => {
      const m = this.#row(id);
      if (m.duration_ms != null && startMs >= m.duration_ms) {
        throw new AppError('invalid_input', `시작 ${startMs}ms가 음성 길이 ${m.duration_ms}ms 이상`);
      }
      const last = this.db.prepare(
        'SELECT max(start_ms) AS s FROM transcript_segments WHERE meeting_id = ?',
      ).get(id).s;
      if (last != null && startMs < last) {
        throw new AppError('invalid_input', `순서가 뒤집힘: 앞 구간 시작 ${last}ms보다 앞섬`);
      }
      const end = m.duration_ms != null ? Math.min(endMs, m.duration_ms) : endMs;
      const res = this.db.prepare(
        'INSERT INTO transcript_segments (meeting_id, start_ms, end_ms, text) VALUES (?, ?, ?, ?)',
      ).run(id, startMs, end, text.trim());
      this.db.prepare('UPDATE meetings SET updated_at = ? WHERE id = ?').run(nowIso(), id);
      return this.db.prepare('SELECT * FROM transcript_segments WHERE id = ?').get(Number(res.lastInsertRowid));
    });
  }

  // 회의 음성 파일 가져오기: 원음(16kHz WAV)을 저장 폴더에 쓰고, 받아쓰기 구간을 같은 시간 규칙으로 넣고 멈춘다.
  // 중간에 실패하면 만든 회의·원음을 지워 반쪽 기록을 남기지 않는다.
  importAudio(title, { wav, segments = [], durationMs }) {
    if (!Buffer.isBuffer(wav) || wav.length === 0) throw new AppError('invalid_input', '원음이 비어 있음');
    intMs('durationMs', durationMs);
    const m = this.start(title);
    const path = this.audioPath(m.id);
    try {
      try {
        mkdirSync(this.audioDir, { recursive: true }); // 저장 폴더가 없으면 만든다
        this.fs.writeFileSync(path, wav);
      } catch (e) {
        throw new AppError('storage_error', `원음 저장 실패: ${e.code ?? e.message}`);
      }
      for (const s of [...segments].sort((a, b) => a.startMs - b.startMs)) {
        this.addSegment(m.id, { startMs: s.startMs, endMs: s.endMs, text: s.text });
      }
      const { clamped, dropped } = this.stop(m.id, durationMs);
      return { meeting: this.get(m.id), segments: this.segments(m.id), clamped, dropped };
    } catch (e) {
      try { if (this.fs.existsSync(path)) this.fs.unlinkSync(path); } catch { /* 지우기 실패는 아래 오류로 함께 알린다 */ }
      this.#inTx(() => {
        this.db.prepare('DELETE FROM transcript_segments WHERE meeting_id = ?').run(m.id);
        this.db.prepare('DELETE FROM meetings WHERE id = ?').run(m.id);
      });
      scrub(this.db);
      throw e;
    }
  }

  // 원음 읽기(재생용). 없으면 not_found.
  readAudio(id) {
    const path = this.audioPath(id);
    if (!this.fs.existsSync(path)) throw new AppError('not_found', '원음 파일이 없음(지워졌거나 저장 실패)');
    return this.fs.readFileSync(path);
  }

  // 녹음 멈춤. 길이에 맞춰 구간을 정리한다.
  stop(id, durationMs) {
    intMs('durationMs', durationMs);
    if (durationMs === 0) throw new AppError('invalid_input', '음성 길이가 0');
    return this.#inTx(() => {
      const m = this.#row(id);
      if (m.status !== 'recording') throw new AppError('invalid_state', `회의 ${id} 상태 ${m.status}에서는 멈출 수 없음`);
      const dropped = this.db.prepare(
        'DELETE FROM transcript_segments WHERE meeting_id = ? AND start_ms >= ?',
      ).run(id, durationMs).changes;
      const clamped = this.db.prepare(
        'UPDATE transcript_segments SET end_ms = ? WHERE meeting_id = ? AND end_ms > ?',
      ).run(durationMs, id, durationMs).changes;
      this.db.prepare("UPDATE meetings SET status = 'stopped', duration_ms = ?, updated_at = ? WHERE id = ?")
        .run(durationMs, nowIso(), id);
      return { meeting: this.get(id), clamped: Number(clamped), dropped: Number(dropped) };
    });
  }

  segments(id) {
    this.#row(id);
    return this.db.prepare(
      'SELECT * FROM transcript_segments WHERE meeting_id = ? ORDER BY start_ms, id',
    ).all(id);
  }

  // 회의록 검색(FR-008a): 제목·녹취 글에서 찾는다. 검색어의 %·_·\는 글자 그대로 찾는다(LIKE ESCAPE).
  // 결과는 회의별로 묶고, 녹취는 시간 순 구간(시작·끝 ms)으로 준다. 너무 많으면 limit에서 자르고 truncated로 알린다.
  search(query, { limit = 200 } = {}) {
    if (typeof query !== 'string' || query.trim() === '') throw new AppError('invalid_input', '검색어가 비어 있음');
    const q = query.trim();
    if (q.length > 100) throw new AppError('invalid_input', '검색어는 100자 이하');
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const pick = (m) => ({ id: m.id, title: m.title, status: m.status, duration_ms: m.duration_ms, updated_at: m.updated_at });
    const byId = new Map();
    const entry = (m) => {
      if (!byId.has(m.id)) byId.set(m.id, { meeting: pick(m), titleMatch: false, segments: [] });
      return byId.get(m.id);
    };
    for (const m of this.db.prepare("SELECT * FROM meetings WHERE title LIKE ? ESCAPE '\\' ORDER BY id").all(like)) entry(m).titleMatch = true;
    const segs = this.db.prepare(
      `SELECT s.id, s.meeting_id, s.start_ms, s.end_ms, s.text FROM transcript_segments s
       WHERE s.text LIKE ? ESCAPE '\\' ORDER BY s.meeting_id, s.start_ms, s.id LIMIT ?`,
    ).all(like, limit + 1);
    const truncated = segs.length > limit;
    for (const s of segs.slice(0, limit)) {
      entry(this.#row(s.meeting_id)).segments.push({ id: s.id, start_ms: s.start_ms, end_ms: s.end_ms, text: s.text });
    }
    const results = [...byId.values()].sort((a, b) => a.meeting.id - b.meeting.id);
    return { query: q, results, segmentCount: Math.min(segs.length, limit), truncated };
  }

  // 시간을 누르면 재생할 위치. 원음이 없으면 알린다.
  seek(id, segmentId) {
    const seg = this.db.prepare('SELECT * FROM transcript_segments WHERE id = ? AND meeting_id = ?').get(segmentId, id);
    if (!seg) throw new AppError('not_found', `구간 ${segmentId} 없음`);
    const path = this.audioPath(id);
    if (!this.fs.existsSync(path)) throw new AppError('not_found', '원음 파일이 없음(지워졌거나 저장 실패)');
    return { audioPath: path, offsetMs: seg.start_ms, endMs: seg.end_ms };
  }

  // 원음 파일만 지운다. 지우기 실패면 오류를 알리고 기록은 그대로 둔다.
  deleteAudio(id) {
    const path = this.audioPath(id);
    if (this.fs.existsSync(path)) {
      try {
        this.fs.unlinkSync(path);
      } catch (e) {
        throw new AppError('storage_error', `원음 삭제 실패: ${e.code ?? e.message}`);
      }
    }
    return { id, audioDeleted: true };
  }

  deleteTranscript(id) {
    this.#row(id);
    const n = this.db.prepare('DELETE FROM transcript_segments WHERE meeting_id = ?').run(id).changes;
    this.db.prepare('DELETE FROM meeting_summaries WHERE meeting_id = ?').run(id); // 녹취에서 만든 정리도 함께
    scrub(this.db);
    return { id, segmentsDeleted: Number(n) };
  }

  // 회의 전체 삭제: 원음 먼저 지우고, 성공하면 기록을 지운다. 녹음 중이면 거부.
  delete(id) {
    const m = this.#row(id);
    if (m.status === 'recording') throw new AppError('invalid_state', '녹음 중인 회의는 먼저 멈춰야 함');
    this.deleteAudio(id);
    this.#inTx(() => {
      this.db.prepare('DELETE FROM transcript_segments WHERE meeting_id = ?').run(id);
      this.db.prepare('DELETE FROM meeting_summaries WHERE meeting_id = ?').run(id); // 의견·결론 정리도 함께(FR-010b)
      this.db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
    });
    scrub(this.db);
    return { id, deleted: true };
  }

  // 아무것도 녹음하지 못한 회의를 없앤다(상태와 상관없이). 원음 먼저 지운다.
  discard(id) {
    this.deleteAudio(id);
    this.#inTx(() => {
      this.db.prepare('DELETE FROM transcript_segments WHERE meeting_id = ?').run(id);
      this.db.prepare('DELETE FROM meeting_summaries WHERE meeting_id = ?').run(id); // 의견·결론 정리도 함께(FR-010b)
      this.db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
    });
    scrub(this.db);
    return { id, deleted: true };
  }

  // 앱 시작 때 한 번. 녹음 중에 꺼진 회의는 '중단'으로 두고 녹취는 남긴다(길이는 미정).
  recoverInterrupted() {
    const rows = this.db.prepare("SELECT id FROM meetings WHERE status = 'recording'").all();
    for (const r of rows) {
      this.db.prepare("UPDATE meetings SET status = 'interrupted', updated_at = ? WHERE id = ?").run(nowIso(), r.id);
    }
    return rows.map((r) => r.id);
  }
}
