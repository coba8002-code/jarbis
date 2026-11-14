import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';
import { nowIso } from '../store/db.js';
import { looksLikeSecret } from '../security/secrets.js';
import { defaultExecutors } from './executors.js';
import { tierOf, PENDING_TTL_MS } from './tiers.js';

const TERMINAL = new Set(['rejected', 'cancelled', 'done', 'failed', 'interrupted']);
const EDITABLE = new Set(['pending', 'approved']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function contentVersion({ kind, title, target, content, impact }) {
  return createHash('sha256').update(canonical({ kind, title, target, content, impact })).digest('hex');
}

function requireText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError('invalid_input', `${name} 값이 비어 있음`);
  }
}

// 작업 기록에 비밀 키처럼 보이는 값을 남기지 않는다(FR-010). 내용 안의 모든 글자 값을 검사한다.
function rejectSecrets({ title, target, content, impact }) {
  const texts = [title, target, impact];
  const walk = (v) => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { texts.push(k); walk(x); });
  };
  walk(content);
  if (texts.some((t) => looksLikeSecret(t))) {
    throw new AppError('rejected_secret', '비밀 키처럼 보이는 값은 작업 기록에 저장하지 않음');
  }
}

export class MissionControl {
  constructor(db, { executors = defaultExecutors() } = {}) {
    this.db = db;
    this.executors = executors;
  }

  #row(id) {
    const row = this.db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
    if (!row) throw new AppError('not_found', `미션 ${id} 없음`);
    return row;
  }

  #toMission(row) {
    return {
      ...row,
      tier: tierOf(row.kind), // 위험 단계(PC 규칙, tiers.js)
      content: JSON.parse(row.content),
      result: row.result == null ? null : JSON.parse(row.result),
    };
  }

  #event(id, from, to, note = null) {
    this.db.prepare(
      'INSERT INTO mission_events (mission_id, at, from_status, to_status, note) VALUES (?, ?, ?, ?, ?)',
    ).run(id, nowIso(), from, to, note);
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

  #transition(id, fromList, to, extra = {}, note = null) {
    const sets = ['status = ?', 'updated_at = ?'];
    const args = [to, nowIso()];
    for (const [k, v] of Object.entries(extra)) {
      sets.push(`${k} = ?`);
      args.push(v);
    }
    const placeholders = fromList.map(() => '?').join(',');
    this.#inTx(() => {
      const before = this.#row(id);
      const res = this.db.prepare(
        `UPDATE missions SET ${sets.join(', ')} WHERE id = ? AND status IN (${placeholders})`,
      ).run(...args, id, ...fromList);
      if (res.changes !== 1) {
        throw new AppError('invalid_state', `미션 ${id} 상태 ${before.status}에서 ${to}로 바꿀 수 없음`);
      }
      this.#event(id, before.status, to, note);
    });
    return this.get(id);
  }

  create({ kind, title, target, content = {}, impact, source = 'manual' }) {
    requireText('kind', kind);
    requireText('title', title);
    requireText('target', target);
    requireText('impact', impact);
    rejectSecrets({ title, target, content, impact });
    if (!this.executors[kind]) throw new AppError('unknown_executor', `실행기 ${kind} 없음`);
    const version = contentVersion({ kind, title, target, content, impact });
    const at = nowIso();
    const id = this.#inTx(() => {
      const res = this.db.prepare(
        `INSERT INTO missions (kind, title, target, content, impact, content_version, status, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      ).run(kind, title, target, JSON.stringify(content), impact, version, source, at, at);
      const newId = Number(res.lastInsertRowid);
      this.#event(newId, null, 'pending', 'created');
      return newId;
    });
    return this.get(id);
  }

  get(id) {
    return this.#toMission(this.#row(id));
  }

  list({ status } = {}) {
    const rows = status
      ? this.db.prepare('SELECT * FROM missions WHERE status = ? ORDER BY id').all(status)
      : this.db.prepare('SELECT * FROM missions ORDER BY id').all();
    return rows.map((r) => this.#toMission(r));
  }

  events(id) {
    this.#row(id);
    return this.db.prepare('SELECT * FROM mission_events WHERE mission_id = ? ORDER BY id').all(id);
  }

  // 사용자가 본 내용 버전을 함께 보내야 승인된다.
  approve(id, version) {
    const row = this.#row(id);
    if (typeof version !== 'string' || version !== row.content_version) {
      throw new AppError('version_mismatch', '승인하려는 내용 버전이 현재 내용과 다름');
    }
    if (row.status === 'approved' && row.approved_version === version) return this.get(id);
    return this.#transition(id, ['pending'], 'approved', { approved_version: version }, `version ${version}`);
  }

  reject(id) {
    return this.#transition(id, ['pending'], 'rejected');
  }

  // 위험 "낮음" 작업 한꺼번에 승인. 각 항목은 사용자가 화면에서 본 내용 버전이 있어야 한다(버전이 다르면 그 항목만 실패).
  // 위험 "높음"은 하나씩만 승인한다.
  approveLow(items) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) throw new AppError('invalid_input', 'items는 1~50개');
    return items.map(({ id, version }) => {
      try {
        const row = this.#row(Number(id));
        if (tierOf(row.kind) !== 'low') throw new AppError('invalid_state', `미션 ${row.id}은(는) 위험 높음이라 하나씩 승인해야 함`);
        return { id: row.id, ok: true, mission: this.approve(row.id, version) };
      } catch (e) {
        return { id: Number(id), ok: false, error: { code: e.code ?? 'internal', message: e.message } };
      }
    });
  }

  // 오래된 승인 대기 정리: maxAgeMs(기본 24시간)보다 오래 기다린 작업은 취소로 바꾼다(실행하지 않음). 바꾼 번호를 돌려준다.
  expireStale({ now = Date.now(), maxAgeMs = PENDING_TTL_MS } = {}) {
    const cut = new Date(now - maxAgeMs).toISOString();
    const old = this.db.prepare("SELECT id FROM missions WHERE status = 'pending' AND updated_at < ?").all(cut);
    const done = [];
    for (const { id } of old) {
      try { this.#transition(id, ['pending'], 'cancelled', {}, 'expired: 24시간 넘게 승인 대기'); done.push(id); } catch { /* 그 사이 바뀐 것은 둔다 */ }
    }
    return done;
  }

  cancel(id) {
    return this.#transition(id, ['pending', 'approved'], 'cancelled');
  }

  // 내용이 바뀌면 새 버전이 되고 이전 승인은 무효가 된다.
  update(id, changes = {}) {
    const row = this.#row(id);
    if (!EDITABLE.has(row.status)) {
      throw new AppError('invalid_state', `미션 ${id} 상태 ${row.status}에서는 수정할 수 없음`);
    }
    const next = {
      kind: row.kind,
      title: changes.title ?? row.title,
      target: changes.target ?? row.target,
      content: changes.content ?? JSON.parse(row.content),
      impact: changes.impact ?? row.impact,
    };
    requireText('title', next.title);
    requireText('target', next.target);
    requireText('impact', next.impact);
    rejectSecrets(next);
    const version = contentVersion(next);
    if (version === row.content_version) return this.get(id);
    return this.#transition(id, ['pending', 'approved'], 'pending', {
      title: next.title,
      target: next.target,
      content: JSON.stringify(next.content),
      impact: next.impact,
      content_version: version,
      approved_version: null,
    }, `content changed to ${version}`);
  }

  async execute(id) {
    const row = this.#row(id);
    if (row.status === 'pending') throw new AppError('approval_required', `미션 ${id}은(는) 승인 전`);
    if (row.status !== 'approved') {
      throw new AppError('invalid_state', `미션 ${id} 상태 ${row.status}에서는 실행할 수 없음`);
    }
    const executor = this.executors[row.kind];
    if (!executor) throw new AppError('unknown_executor', `실행기 ${row.kind} 없음`);

    // 조건부 갱신으로 선점한다. 승인 상태이고 승인 버전이 현재 버전일 때 한 번만 성공한다.
    const claimed = this.#inTx(() => {
      const res = this.db.prepare(
        `UPDATE missions SET status = 'running', updated_at = ?
         WHERE id = ? AND status = 'approved' AND approved_version = content_version`,
      ).run(nowIso(), id);
      if (res.changes === 1) this.#event(id, 'approved', 'running');
      return res.changes === 1;
    });
    if (!claimed) {
      const now = this.#row(id);
      if (now.status === 'pending') throw new AppError('approval_required', `미션 ${id}은(는) 재승인 필요`);
      throw new AppError('invalid_state', `미션 ${id}은(는) 이미 ${now.status}`);
    }

    const mission = this.get(id);
    const ac = new AbortController();
    this.#running.add(ac);
    let result;
    try {
      result = await executor(mission, { signal: ac.signal });
    } catch (e) {
      // 끄는 중에 멈춘 실행은 중단으로 남긴다(자동 재실행 없음). 그 밖의 실패는 기록만 하고 자동 재실행하지 않는다.
      if (ac.signal.aborted) return this.#transition(id, ['running'], 'interrupted', { error: '앱을 끄는 중이라 실행을 멈춤' }, 'shutdown');
      return this.#transition(id, ['running'], 'failed', { error: `${e.code ?? 'error'}: ${e.message}` });
    } finally {
      this.#running.delete(ac);
    }
    return this.#transition(id, ['running'], 'done', { result: JSON.stringify(result ?? null) });
  }

  // 실행 중인 미션의 취소 신호들. 앱을 끌 때 abortAll()로 멈춘다(DB를 닫기 전).
  #running = new Set();

  abortAll() {
    const n = this.#running.size;
    for (const ac of this.#running) ac.abort();
    return n;
  }

  // 앱 시작 때 한 번 부른다. 실행 중에 꺼진 미션은 자동 재실행하지 않고 중단으로 표시한다.
  recoverInterrupted() {
    const running = this.list({ status: 'running' });
    for (const m of running) this.#transition(m.id, ['running'], 'interrupted', {}, 'restart recovery');
    return running.map((m) => m.id);
  }
}
