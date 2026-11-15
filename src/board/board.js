// 대기화면(쉬는 화면) 자료(2026-11-15 사용자 요청: 캐릭터 애니메이션 + 날씨 + 오늘 중요한 일 + 해야 할 일).
// - 날씨: k-skill 날씨 스킬(korea-weather)을 켜고 기본 위치를 넣었을 때만. 단기예보 한 번 조회 → 지금 기온·하늘·비 확률·최저/최고. 30분 캐시.
// - 오늘 중요한 일: 구글 캘린더 오늘 일정 + 기한이 오늘이거나 지난 할 일.
// - 해야 할 일: 고른 "할 일 가져오는 곳"(지금은 구글 Tasks). ax.designjux.com은 나중에 연동할 자리만 둔다(사용자 계획).
// 자료는 화면 표시용으로만 쓰고 저장하지 않는다. 일정·할 일 글은 AI로 보내지 않는다.
import { AppError } from '../errors.js';

const WEATHER_MS = 30 * 60 * 1000;
const SOURCE_KEY = 'board.todoSource';
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 할 일 가져오는 곳. planned: 아직 연동 전(고를 수 없음).
export const TODO_SOURCES = {
  google: { label: '구글 Tasks' },
  axdesignjux: { label: 'ax.designjux.com', planned: true, note: '나중에 연동할 예정이에요' },
};

const SKY = { 1: '맑음', 3: '구름 많음', 4: '흐림' };
const PTY = { 1: '비', 2: '비 또는 눈', 3: '눈', 4: '소나기', 5: '빗방울', 6: '빗방울 눈날림', 7: '눈날림' };

// k-skill 응답에서 기상청 항목 배열({ category, fcstDate, fcstTime, fcstValue })을 찾는다(감싼 모양이 달라도).
function findItems(v, depth = 0) {
  if (!v || depth > 6) return null;
  if (Array.isArray(v)) {
    if (v.length && v.every((x) => x && typeof x === 'object' && 'category' in x)) return v;
    for (const x of v) { const f = findItems(x, depth + 1); if (f) return f; }
    return null;
  }
  if (typeof v === 'object') for (const x of Object.values(v)) { const f = findItems(x, depth + 1); if (f) return f; }
  return null;
}

// 단기예보 글(JSON) → 화면용 날씨. 못 읽으면 null.
export function parseKmaForecast(text, now = new Date()) {
  let json;
  try { json = JSON.parse(text); } catch { return null; }
  const items = findItems(json);
  if (!items) return null;
  const slots = new Map(); // 'YYYYMMDDHHMM' → { TMP, SKY, PTY, POP }
  for (const it of items) {
    const d = String(it.fcstDate ?? ''); const t = String(it.fcstTime ?? '').padStart(4, '0');
    if (!/^\d{8}$/.test(d) || !/^\d{4}$/.test(t)) continue;
    const k = d + t;
    if (!slots.has(k)) slots.set(k, {});
    slots.get(k)[it.category] = String(it.fcstValue ?? '');
  }
  if (!slots.size) return null;
  const today = dayOf(now).replaceAll('-', '');
  const nowKey = `${today}${pad(now.getHours())}00`;
  const keys = [...slots.keys()].sort();
  const cur = keys.find((k) => k >= nowKey && slots.get(k).TMP !== undefined) ?? keys.find((k) => slots.get(k).TMP !== undefined);
  if (!cur) return null;
  const s = slots.get(cur);
  const temps = keys.filter((k) => k.startsWith(today)).map((k) => Number(slots.get(k).TMP)).filter(Number.isFinite);
  // 최저·최고(T374): 오늘 TMN·TMX가 있으면 "오늘". 저녁 발표엔 오늘 값이 빠지므로 오후 3시 넘으면 "내일" 값,
  // 그것도 없으면 오늘 남은 시간의 기온에서 구하고 "오늘 남은 시간"이라고 알린다.
  const dayMinMax = (day) => {
    let n = null; let x = null;
    for (const it of items) {
      if (String(it.fcstDate) !== day) continue;
      if (it.category === 'TMN') n = Number(it.fcstValue);
      if (it.category === 'TMX') x = Number(it.fcstValue);
    }
    return { n: Number.isFinite(n) ? n : null, x: Number.isFinite(x) ? x : null };
  };
  const t0 = dayMinMax(today);
  const tomorrowDay = dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)).replaceAll('-', '');
  const t1 = dayMinMax(tomorrowDay);
  let min = t0.n; let max = t0.x; let range = '오늘';
  if ((min === null || max === null) && now.getHours() >= 15 && t1.n !== null && t1.x !== null) {
    min = t1.n; max = t1.x; range = '내일';
  } else if (min === null || max === null) {
    if (min === null && temps.length) min = Math.min(...temps);
    if (max === null && temps.length) max = Math.max(...temps);
    range = '오늘 남은 시간';
  }
  const pty = Number(s.PTY ?? 0);
  const sky = Number(s.SKY ?? 1);
  const pops = keys.filter((k) => k.startsWith(today) && k >= nowKey).map((k) => Number(slots.get(k).POP)).filter(Number.isFinite);
  return {
    temp: Number(s.TMP),
    sky: pty > 0 ? (PTY[pty] ?? '비') : (SKY[sky] ?? '맑음'),
    icon: pty === 3 || pty === 7 ? 'snow' : pty > 0 ? 'rain' : sky >= 4 ? 'cloud' : sky === 3 ? 'partly' : 'sun',
    pop: pops.length ? Math.max(...pops) : (Number.isFinite(Number(s.POP)) ? Number(s.POP) : null),
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    range,
    at: `${cur.slice(8, 10)}:${cur.slice(10, 12)}`,
  };
}

export class Board {
  // kskills: KSkills(날씨 스킬) · google: GoogleLink · settings: 설정
  constructor({ settings, kskills, google, now = () => new Date() }) {
    Object.assign(this, { settings, kskills, google, now });
    this.weatherCache = null;
  }

  todoSource() {
    const id = this.settings.get(SOURCE_KEY, 'google');
    return TODO_SOURCES[id] && !TODO_SOURCES[id].planned ? id : 'google';
  }

  setTodoSource(id) {
    const s = TODO_SOURCES[id];
    if (!s) throw new AppError('invalid_input', `모르는 할 일 가져오는 곳: ${String(id).slice(0, 30)}`);
    if (s.planned) throw new AppError('invalid_state', `${s.label}는 아직 연동 전이에요`);
    this.settings.set(SOURCE_KEY, id);
    return this.settingsView();
  }

  settingsView() {
    return { todoSource: this.todoSource(), sources: Object.entries(TODO_SOURCES).map(([id, s]) => ({ id, label: s.label, planned: Boolean(s.planned), note: s.note ?? '' })) };
  }

  // 날씨: 스킬이 꺼져 있거나 위치가 없으면 이유만
  async weather() {
    const k = this.kskills;
    const home = k?.home?.() ?? null;
    if (!k || !k.enabledMap?.()['korea-weather']) return { off: true, reason: '설정 → 스킬에서 날씨를 켜면 보여요' };
    if (!home) return { off: true, reason: '설정 → 스킬에서 기본 위치를 넣으면 보여요' };
    if (this.weatherCache && Date.now() - this.weatherCache.at < WEATHER_MS) return this.weatherCache.value;
    const skill = k.catalog?.find((s) => s.name === 'korea-weather');
    let value;
    try {
      const r = await k.call(skill, { path: '/v1/korea-weather/forecast', query: { lat: home.lat, lon: home.lon } }, { full: true });
      const w = parseKmaForecast(r.text, this.now());
      value = w ? { ...w, place: home.name || '기본 위치' } : { off: true, reason: '날씨를 읽지 못했어요' };
    } catch (e) {
      value = { off: true, reason: `날씨를 가져오지 못했어요(${e.message})` };
    }
    this.weatherCache = { at: Date.now(), value };
    return value;
  }

  // 오늘 중요한 일 + 해야 할 일
  async lists() {
    const g = this.google;
    const connected = Boolean(g?.status?.().connected);
    const source = this.todoSource();
    const empty = { important: { connected, items: [] }, todos: { source, label: TODO_SOURCES[source].label, connected, items: [] } };
    if (!connected) return { ...empty, note: '설정 → 단축키·구글에서 구글을 연결하면 보여요' };
    const today = dayOf(this.now());
    let events = [];
    let tasks = [];
    let note = '';
    try { events = (await g.events({ days: 1 })).filter((e) => String(e.start ?? '').slice(0, 10) <= today); } catch (e) { note = `일정을 읽지 못했어요(${e.message})`; }
    try { tasks = await g.tasks(); } catch (e) { note = note || `할 일을 읽지 못했어요(${e.message})`; }
    const important = [
      ...events.map((e) => ({ kind: 'event', time: e.allDay ? '하루 종일' : String(e.start).slice(11, 16), title: e.title })),
      ...tasks.filter((t) => t.due && t.due <= today).map((t) => ({ kind: 'task', time: t.due < today ? '기한 지남' : '오늘까지', title: t.title, late: t.due < today })),
    ].slice(0, 6);
    const todos = tasks.slice(0, 8).map((t) => ({ title: t.title, due: t.due, late: Boolean(t.due && t.due < today), today: t.due === today }));
    return { important: { connected, items: important }, todos: { source, label: TODO_SOURCES[source].label, connected, items: todos, total: tasks.length }, ...(note ? { note } : {}) };
  }

  async view() {
    const [weather, lists] = await Promise.all([this.weather().catch(() => ({ off: true, reason: '날씨를 가져오지 못했어요' })), this.lists()]);
    return { at: this.now().toISOString(), weather, ...lists };
  }
}
