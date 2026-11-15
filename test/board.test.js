// 대기화면 자료(board.js)와 보드 규칙(idle-board.js) 검사. 날씨·구글은 가짜만 쓴다(외부 전송 없음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKmaForecast, Board, TODO_SOURCES } from '../src/board/board.js';
import { nextGag, dueText, GAGS } from '../src/server/public/idle-board.js';
import { Settings } from '../src/store/settings.js';
import { openDb } from '../src/store/db.js';
import { tempDbPath } from './helpers.js';

const NOW = new Date(2026, 10, 15, 9, 20);
const kma = (rows) => JSON.stringify({ response: { body: { items: { item: rows } } } });
const row = (category, fcstDate, fcstTime, fcstValue) => ({ category, fcstDate, fcstTime, fcstValue });
const forecast = kma([
  row('TMP', '20261115', '0900', '8'), row('SKY', '20261115', '0900', '3'), row('PTY', '20261115', '0900', '0'), row('POP', '20261115', '0900', '20'),
  row('TMP', '20261115', '1000', '10'), row('SKY', '20261115', '1000', '1'), row('PTY', '20261115', '1000', '0'), row('POP', '20261115', '1000', '60'),
  row('TMN', '20261115', '0600', '3'), row('TMX', '20261115', '1500', '14'),
  row('TMP', '20261116', '0900', '6'), row('SKY', '20261116', '0900', '4'), row('PTY', '20261116', '0900', '1'),
]);

test('기상청 단기예보 읽기: 지금 시각 칸의 기온·하늘, 오늘 최저·최고, 남은 시간 비 확률 최댓값', () => {
  assert.deepEqual(parseKmaForecast(forecast, NOW), { temp: 8, sky: '구름 많음', icon: 'partly', pop: 60, min: 3, max: 14, range: '오늘', at: '09:00' });
  const rain = parseKmaForecast(kma([row('TMP', '20261115', '1000', '5'), row('SKY', '20261115', '1000', '4'), row('PTY', '20261115', '1000', '1')]), NOW);
  assert.equal(rain.sky, '비');
  assert.equal(rain.icon, 'rain');
  assert.equal(rain.min, 5, '최저·최고가 없으면 오늘 기온에서 구함');
  assert.equal(parseKmaForecast('not json', NOW), null);
  assert.equal(parseKmaForecast(JSON.stringify({ items: [] }), NOW), null);
});

function setup({ skillOn = true, home = { lat: 37.5, lon: 127, name: '우리 집' }, connected = true, failWeather = false } = {}) {
  const db = openDb(tempDbPath());
  const settings = new Settings(db);
  const calls = [];
  const kskills = {
    catalog: [{ name: 'korea-weather' }],
    home: () => home,
    enabledMap: () => ({ 'korea-weather': skillOn }),
    call: async (skill, plan, opts) => { calls.push({ ...plan, full: opts?.full === true }); if (failWeather) throw new Error('조회 서버 연결 실패'); return { text: forecast }; },
  };
  const google = {
    status: () => ({ connected }),
    events: async () => [
      { title: '팀 회의', start: '2026-11-15T10:00:00+09:00', allDay: false },
      { title: '엄마 생신', start: '2026-11-15', allDay: true },
      { title: '내일 일정', start: '2026-11-16T10:00:00+09:00', allDay: false },
    ],
    tasks: async () => [
      { title: '보고서 내기', due: '2026-11-14' }, { title: '우유 사기', due: '2026-11-15' }, { title: '여행 준비', due: '2026-11-20' }, { title: '책 읽기', due: null },
    ],
  };
  return { board: new Board({ settings, kskills, google, now: () => NOW }), calls, db };
}

test('날씨: 스킬이 꺼졌거나 위치가 없으면 이유만, 켜져 있으면 한 번 조회하고 30분 동안 다시 묻지 않는다', async (t) => {
  const off = setup({ skillOn: false }); t.after(() => off.db.close());
  assert.match((await off.board.weather()).reason, /날씨를 켜면/);
  assert.equal(off.calls.length, 0);
  const noHome = setup({ home: null }); t.after(() => noHome.db.close());
  assert.match((await noHome.board.weather()).reason, /기본 위치/);
  const ok = setup(); t.after(() => ok.db.close());
  const w = await ok.board.weather();
  assert.equal(w.place, '우리 집');
  assert.equal(w.temp, 8);
  assert.deepEqual(ok.calls[0], { path: '/v1/korea-weather/forecast', query: { lat: 37.5, lon: 127 }, full: true }, '예보 전체(JSON)를 읽음');
  await ok.board.weather();
  assert.equal(ok.calls.length, 1, '캐시');
  const bad = setup({ failWeather: true }); t.after(() => bad.db.close());
  assert.equal((await bad.board.weather()).off, true);
});

test('오늘 중요한 일 = 오늘 일정 + 기한이 오늘·지난 할 일, 해야 할 일 = 남은 할 일', async (t) => {
  const { board, db } = setup(); t.after(() => db.close());
  const v = await board.view();
  assert.deepEqual(v.important.items.map((x) => `${x.time} ${x.title}`), ['10:00 팀 회의', '하루 종일 엄마 생신', '기한 지남 보고서 내기', '오늘까지 우유 사기']);
  assert.equal(v.todos.label, '구글 Tasks');
  assert.equal(v.todos.items.length, 4);
  assert.equal(v.todos.items[0].late, true);
  assert.equal(v.weather.sky, '구름 많음');
  const off = setup({ connected: false }); t.after(() => off.db.close());
  const nv = await off.board.view();
  assert.equal(nv.important.connected, false);
  assert.match(nv.note, /구글을 연결/);
});

test('할 일 가져오는 곳: 지금은 구글 Tasks, ax.designjux.com은 나중에 연동할 자리만(고를 수 없음)', (t) => {
  const { board, db } = setup(); t.after(() => db.close());
  assert.equal(board.todoSource(), 'google');
  assert.ok(TODO_SOURCES.axdesignjux.planned);
  assert.throws(() => board.setTodoSource('axdesignjux'), { code: 'invalid_state' });
  assert.throws(() => board.setTodoSource('nope'), { code: 'invalid_input' });
  const view = board.settingsView();
  assert.deepEqual(view.sources.map((s) => `${s.id}:${s.planned}`), ['google:false', 'axdesignjux:true']);
});

test('대기화면 잠꼬대: 방금 한 것은 다시 안 하고, 기한 글은 짧게', () => {
  for (let i = 0; i < 100; i += 1) {
    const last = GAGS[i % GAGS.length].id;
    assert.notEqual(nextGag(Math.random, last).id, last);
  }
  assert.equal(dueText('2026-11-14', '2026-11-15'), '기한 지남');
  assert.equal(dueText('2026-11-15', '2026-11-15'), '오늘까지');
  assert.equal(dueText('2026-11-20', '2026-11-15'), '11/20까지');
  assert.equal(dueText(null), '');
});
