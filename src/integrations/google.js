// 구글 캘린더·구글 Tasks 연동(2026-11-15 사용자 요청: 보기 + 추가·완료, 아침 브리핑에 넣기).
// - 인증: 사용자가 만든 OAuth 클라이언트(데스크톱 앱)로 사용자가 직접 로그인한다. JARVIS는 비밀번호를 받지 않는다.
//   로그인 창은 이 PC 브라우저에서 열고, 돌아오는 주소는 이 PC(127.0.0.1)의 임시 포트다(PKCE + state 확인).
// - 저장: 받은 열쇠(토큰)는 데이터 폴더의 google-token.json에만 둔다. 화면·기록에 내보내지 않는다.
// - 범위: 기본 캘린더(primary)의 일정 보기·추가, 기본 할 일 목록(@default)의 보기·추가·완료. 지우기는 하지 않는다.
// - 외부 전송: 구글 서버에만 보낸다. 일정·할 일 글은 클라우드 AI로 보내지 않는다(브리핑은 이 기기 안 모델만).
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../errors.js';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
];
export const GOOGLE_URLS = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  calendar: 'https://www.googleapis.com/calendar/v3',
  tasks: 'https://tasks.googleapis.com/tasks/v1',
};
const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;
const CACHE_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;
const MAX_TITLE = 200;

const b64url = (buf) => buf.toString('base64url');
const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

// 날짜 글(YYYY-MM-DD)이 실제 있는 날인지
function validDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
const dateOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  return dateOf(new Date(y, m - 1, d + n));
}
// 이 PC 시간대가 붙은 RFC3339 글(예: 2026-11-15T10:00:00+09:00)
export function localRfc3339(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  const off = -dt.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${date}T${pad(hh)}:${pad(mm)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
function cleanTitle(t) {
  if (typeof t !== 'string' || !t.trim()) throw new AppError('invalid_input', '제목을 적어 주세요');
  const s = t.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (s.length > MAX_TITLE) throw new AppError('invalid_input', `제목은 ${MAX_TITLE}자까지`);
  return s;
}

// 구글 일정 한 개 → 화면용(필요한 칸만)
export function mapEvent(e) {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  return {
    id: String(e.id ?? ''),
    title: typeof e.summary === 'string' && e.summary.trim() ? e.summary.trim() : '(제목 없음)',
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    allDay,
    location: typeof e.location === 'string' ? e.location.slice(0, 200) : '',
  };
}
// 구글 할 일 한 개 → 화면용. due는 날짜만(구글은 시각을 저장하지 않음).
export function mapTask(t) {
  return {
    id: String(t.id ?? ''),
    title: typeof t.title === 'string' && t.title.trim() ? t.title.trim() : '(제목 없음)',
    due: typeof t.due === 'string' ? t.due.slice(0, 10) : null,
    done: t.status === 'completed',
  };
}

export class GoogleLink {
  // env: JARVIS_GOOGLE_CLIENT_ID · JARVIS_GOOGLE_CLIENT_SECRET (사용자가 .env.local에 넣음)
  // fetchImpl·urls·now: 검사에서 가짜로 바꿈
  constructor({ dataDir, env = process.env, fetchImpl = globalThis.fetch, urls = GOOGLE_URLS, now = () => new Date() }) {
    Object.assign(this, { dataDir, env, fetchImpl, urls, now });
    this.file = join(dataDir, 'google-token.json');
    this.pending = null;
    this.cache = new Map();
    this.lastError = null;
  }

  get clientId() { return this.env.JARVIS_GOOGLE_CLIENT_ID || ''; }
  get clientSecret() { return this.env.JARVIS_GOOGLE_CLIENT_SECRET || ''; }
  get configured() { return Boolean(this.clientId && this.clientSecret); }

  readToken() {
    if (!existsSync(this.file)) return null;
    try {
      const t = JSON.parse(readFileSync(this.file, 'utf8'));
      return t && typeof t.refresh_token === 'string' ? t : null;
    } catch { return null; }
  }

  writeToken(t) {
    writeFileSync(this.file, JSON.stringify(t), { mode: 0o600 });
    try { chmodSync(this.file, 0o600); } catch { /* Windows는 권한 방식이 달라 무시 */ }
  }

  status() {
    const t = this.readToken();
    return {
      configured: this.configured,
      connected: Boolean(t),
      waiting: Boolean(this.pending),
      scopes: t?.scope ? String(t.scope).split(' ').filter((s) => GOOGLE_SCOPES.includes(s)) : [],
      connectedAt: t?.connected_at ?? null,
      lastError: this.lastError,
    };
  }

  // 로그인 시작: 이 PC에 임시 받는 곳을 열고, 사용자가 열 구글 로그인 주소를 돌려준다(5분 안에 끝내야 함).
  async connect() {
    if (!this.configured) throw new AppError('not_configured', '.env.local에 JARVIS_GOOGLE_CLIENT_ID와 JARVIS_GOOGLE_CLIENT_SECRET을 넣고 JARVIS를 다시 켜 주세요');
    this.cancelConnect();
    const state = b64url(randomBytes(16));
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const server = createServer((req, res) => this.onCallback(req, res));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const timer = setTimeout(() => this.cancelConnect(), CONNECT_TIMEOUT_MS);
    timer.unref?.();
    let settle;
    const done = new Promise((resolve) => { settle = resolve; });
    this.pending = { server, port, state, verifier, redirectUri, timer, settle, done };
    const q = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });
    return { authUrl: `${this.urls.auth}?${q}`, expiresInSec: CONNECT_TIMEOUT_MS / 1000 };
  }

  cancelConnect() {
    const p = this.pending;
    if (!p) return false;
    this.pending = null;
    clearTimeout(p.timer);
    p.server.close();
    p.server.closeAllConnections?.();
    p.settle({ ok: false, reason: 'cancelled' });
    return true;
  }

  async onCallback(req, res) {
    const p = this.pending;
    const reply = (status, msg) => {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
      res.end(`<!doctype html><meta charset="utf-8"><title>JARVIS</title><body style="font:16px system-ui;padding:24px"><p>${msg}</p></body>`);
    };
    if (!p || req.headers.host !== `127.0.0.1:${p.port}`) return reply(400, '연결 요청이 없어요. JARVIS 설정에서 다시 눌러 주세요.');
    const url = new URL(req.url, `http://127.0.0.1:${p.port}`);
    if (url.pathname !== '/callback') return reply(404, '없는 주소예요.');
    if (url.searchParams.get('state') !== p.state) return reply(400, '확인 값이 맞지 않아요. JARVIS 설정에서 다시 눌러 주세요.');
    const finish = (ok, reason) => { this.pending = null; clearTimeout(p.timer); setImmediate(() => { p.server.close(); p.server.closeAllConnections?.(); }); p.settle({ ok, reason }); };
    if (url.searchParams.get('error')) {
      this.lastError = { code: 'google_denied', message: '구글 로그인에서 허용하지 않았어요' };
      reply(200, '연결하지 않았어요. 이 창을 닫아도 돼요.');
      return finish(false, 'denied');
    }
    const code = url.searchParams.get('code');
    if (!code) return reply(400, '받은 값이 없어요.');
    try {
      const t = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, code_verifier: p.verifier });
      if (!t.refresh_token) throw new AppError('google_failed', '구글이 오래 쓰는 열쇠를 주지 않았어요. 다시 연결해 주세요');
      this.writeToken({ refresh_token: t.refresh_token, access_token: t.access_token, expires_at: Date.now() + (Number(t.expires_in) || 3600) * 1000, scope: t.scope ?? GOOGLE_SCOPES.join(' '), connected_at: this.now().toISOString() });
      this.cache.clear();
      this.lastError = null;
      reply(200, 'JARVIS에 구글을 연결했어요. 이 창을 닫아도 돼요.');
      finish(true, 'connected');
    } catch (e) {
      this.lastError = { code: e.code ?? 'google_failed', message: e.message };
      reply(200, `연결하지 못했어요: ${e.message}`);
      finish(false, 'failed');
    }
  }

  async tokenRequest(fields) {
    const body = new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...fields });
    let res;
    try {
      res = await this.fetchImpl(this.urls.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new AppError('google_failed', '구글 서버에 닿지 못했어요');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === 'invalid_grant') {
        rmSync(this.file, { force: true });
        throw new AppError('google_not_connected', '구글 연결이 끊겼어요. 설정에서 다시 연결해 주세요');
      }
      throw new AppError('google_failed', `구글 열쇠 받기 실패(${res.status})`);
    }
    return data;
  }

  async accessToken(force = false) {
    const t = this.readToken();
    if (!t) throw new AppError('google_not_connected', '구글이 연결되지 않았어요. 설정 → 단축키·구글에서 연결해 주세요');
    if (!force && t.access_token && Number(t.expires_at) - 60_000 > Date.now()) return t.access_token;
    if (!this.configured) throw new AppError('not_configured', 'JARVIS_GOOGLE_CLIENT_ID·SECRET 설정이 없어요');
    const r = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    this.writeToken({ ...t, access_token: r.access_token, expires_at: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
    return r.access_token;
  }

  // 구글 API 한 번 부르기. 401이면 열쇠를 새로 받아 한 번만 다시.
  async call(method, url, body) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.accessToken(attempt > 0);
      let res;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new AppError('google_failed', '구글 서버에 닿지 못했어요');
      }
      if (res.status === 401 && attempt === 0) continue;
      if (res.status === 204) return {};
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) throw new AppError('google_failed', '구글이 허락하지 않았어요(권한 또는 API 사용 설정 확인)');
      if (!res.ok) throw new AppError('google_failed', `구글 응답 오류(${res.status})`);
      return data;
    }
    throw new AppError('google_not_connected', '구글 연결이 끊겼어요. 다시 연결해 주세요');
  }

  async cached(key, fn) {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await fn();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  // 오늘 0시부터 days일 동안의 일정(최대 50개)
  async events({ days = 7 } = {}) {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 31) throw new AppError('invalid_input', 'days는 1~31');
    return this.cached(`events:${n}`, async () => {
      const from = new Date(this.now()); from.setHours(0, 0, 0, 0);
      const to = new Date(from); to.setDate(to.getDate() + n);
      const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '50', timeMin: from.toISOString(), timeMax: to.toISOString() });
      const data = await this.call('GET', `${this.urls.calendar}/calendars/primary/events?${q}`);
      return (Array.isArray(data.items) ? data.items : []).filter((e) => e.status !== 'cancelled').map(mapEvent);
    });
  }

  // 일정 추가: { title, date: 'YYYY-MM-DD', start?: 'HH:MM', end?: 'HH:MM' }. start가 없으면 하루 종일.
  async addEvent({ title, date, start, end }) {
    const summary = cleanTitle(title);
    if (!validDate(date)) throw new AppError('invalid_input', '날짜는 YYYY-MM-DD(예: 2026-11-20)');
    let body;
    if (!start) {
      body = { summary, start: { date }, end: { date: addDays(date, 1) } };
    } else {
      if (!TIME_RE.test(start)) throw new AppError('invalid_input', '시작 시각은 HH:MM(예: 14:30)');
      let endTime = end;
      if (endTime) {
        if (!TIME_RE.test(endTime)) throw new AppError('invalid_input', '끝 시각은 HH:MM(예: 15:30)');
        if (endTime <= start) throw new AppError('invalid_input', '끝 시각은 시작보다 늦어야 해요');
      } else {
        const [h, m] = start.split(':').map(Number);
        endTime = h >= 23 ? '23:59' : `${pad(h + 1)}:${pad(m)}`;
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      body = { summary, start: { dateTime: localRfc3339(date, start), timeZone: tz }, end: { dateTime: localRfc3339(date, endTime), timeZone: tz } };
    }
    const created = await this.call('POST', `${this.urls.calendar}/calendars/primary/events`, body);
    this.cache.clear();
    return mapEvent(created);
  }

  // 끝내지 않은 할 일(기본 목록, 최대 100개). 날짜 있는 것 먼저, 날짜 순.
  async tasks() {
    return this.cached('tasks', async () => {
      const q = new URLSearchParams({ showCompleted: 'false', showHidden: 'false', maxResults: '100' });
      const data = await this.call('GET', `${this.urls.tasks}/lists/@default/tasks?${q}`);
      const list = (Array.isArray(data.items) ? data.items : []).map(mapTask).filter((t) => !t.done);
      return list.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
    });
  }

  // 할 일 추가: { title, due?: 'YYYY-MM-DD' }
  async addTask({ title, due }) {
    const body = { title: cleanTitle(title) };
    if (due !== undefined && due !== null && due !== '') {
      if (!validDate(due)) throw new AppError('invalid_input', '날짜는 YYYY-MM-DD(예: 2026-11-20)');
      body.due = `${due}T00:00:00.000Z`;
    }
    const created = await this.call('POST', `${this.urls.tasks}/lists/@default/tasks`, body);
    this.cache.clear();
    return mapTask(created);
  }

  async completeTask(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new AppError('invalid_input', '할 일 번호가 잘못됨');
    const r = await this.call('PATCH', `${this.urls.tasks}/lists/@default/tasks/${encodeURIComponent(id)}`, { status: 'completed' });
    this.cache.clear();
    return mapTask(r);
  }

  // 연결 끊기: 구글에 열쇠 취소를 알리고(실패해도 진행) 이 PC의 열쇠 파일을 지운다.
  async disconnect() {
    this.cancelConnect();
    const t = this.readToken();
    let revoked = false;
    if (t) {
      try {
        const res = await this.fetchImpl(this.urls.revoke, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t.refresh_token }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        revoked = res.ok;
      } catch { revoked = false; }
    }
    rmSync(this.file, { force: true });
    this.cache.clear();
    this.lastError = null;
    return { connected: false, revoked };
  }

  // 아침 브리핑용 글(이 기기 안 모델에만 줌). 연결 안 됐거나 실패하면 null.
  async briefingAgenda() {
    if (!this.readToken()) return null;
    const lines = [];
    try {
      const today = dateOf(this.now());
      const events = (await this.events({ days: 1 })).filter((e) => String(e.start ?? '').slice(0, 10) <= today);
      lines.push(`오늘 일정 ${events.length}개`);
      for (const e of events.slice(0, 5)) lines.push(`- ${e.allDay ? '하루 종일' : String(e.start).slice(11, 16)} ${e.title}`);
    } catch { /* 일정을 못 읽으면 할 일만 */ }
    try {
      const today = dateOf(this.now());
      const tasks = await this.tasks();
      const due = tasks.filter((t) => t.due && t.due <= today);
      lines.push(`남은 할 일 ${tasks.length}개, 오늘까지인 것 ${due.length}개`);
      for (const t of (due.length ? due : tasks).slice(0, 5)) lines.push(`- ${t.title}${t.due && t.due < today ? ' (기한 지남)' : ''}`);
    } catch { /* 할 일을 못 읽으면 일정만 */ }
    return lines.length ? lines.join('\n') : null;
  }

  close() { this.cancelConnect(); }
}
