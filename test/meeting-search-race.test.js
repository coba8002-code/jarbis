// 회의록 검색 빠른 전환 경쟁(2026-11-14 실제 실행 QA): "예산" 검색 응답이 늦을 때 바로 다른 검색어로 찾으면
// 늦게 온 "예산" 결과가 새 검색어 결과를 덮었다(응답 순서 뒤집기 프록시로 10/10 재현).
// index.html의 실제 searchMeetings 코드를 작은 가짜 화면에서 돌려 확인한다. 검사마다 제한 시간 2초.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';

const html = readFileSync(new URL('../src/server/public/index.html', import.meta.url), 'utf8');
const pick = (re) => { const m = html.match(re); assert.ok(m, `index.html에서 찾지 못함: ${re}`); return m[0]; };
const source = [
  pick(/const generation = \{\};/),
  pick(/function ticket\(key\) \{[^\n]*\}/),
  pick(/async function searchMeetings\(\) \{[\s\S]*?\n\}/),
  pick(/function refreshMeetingSearch\(\) \{[^\n]*\}/),
].join('\n');

function page() {
  const input = { value: '' };
  const status = { textContent: '' };
  const results = { kids: [], replaceChildren(...k) { this.kids = k; }, get childElementCount() { return this.kids.length; } };
  const nodes = { '#meet-search': input, '#meet-search-status': status, '#meet-search-results': results };
  const el = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids: kids.flat() });
  // 응답은 시험이 직접 풀어 준다. 어느 검색 호출의 요청인지는 비동기 문맥으로 안다.
  const callOf = new AsyncLocalStorage();
  const released = new Set();
  const pending = [];
  const reply = (path) => {
    const q = decodeURIComponent(path.split('q=')[1]);
    return { query: q, results: [{ meeting: { id: q.length, title: `${q} 회의`, status: 'stopped' }, titleMatch: true, segments: [] }], segmentCount: 0, truncated: false };
  };
  const api = (method, path) => new Promise((resolve, reject) => {
    const call = callOf.getStore();
    if (released.has(call)) resolve(reply(path)); else pending.push({ call, path, resolve, reject });
  });
  // data: 정해 준 응답(없으면 검색어로 만든 응답). fail: 그 호출의 요청을 오류로 끝냄.
  const answer = (i, data) => { released.add(i); for (const p of pending.filter((x) => x.call === i)) p.resolve(data ?? reply(p.path)); };
  const fail = (i, message) => { for (const p of pending.filter((x) => x.call === i)) p.reject(new Error(message)); };
  // guard는 화면처럼 함수를 실행한다(새로 고침이 실제로 다시 찾는지 보려고). 실행한 약속은 refreshed에 모은다.
  const refreshed = [];
  const ctx = { $: (s) => nodes[s], el, api, fmtMs: (ms) => String(ms), STATUS: {}, playMeeting: () => {}, guard: (fn) => { refreshed.push(fn()); } };
  const { searchMeetings, refreshMeetingSearch } = new Function(...Object.keys(ctx), `${source}\nreturn { searchMeetings, refreshMeetingSearch };`)(...Object.values(ctx));
  let calls = 0;
  const search = (q) => { input.value = q; const i = calls; calls += 1; return callOf.run(i, () => searchMeetings()); };
  // 회의를 지운 뒤 화면이 부르는 실제 refreshMeetingSearch(검색어는 입력 칸 그대로)
  const refresh = () => { const i = calls; calls += 1; const before = refreshed.length; callOf.run(i, () => refreshMeetingSearch()); return { call: i, ran: refreshed.length > before, done: Promise.all(refreshed.slice(before)) }; };
  return { status, results, search, answer, fail, refresh };
}

const titles = (p) => p.results.kids.map((card) => card.kids[0].kids[0]);

test('늦게 온 옛 검색 결과가 나중에 친 검색어 결과를 덮지 않는다', { timeout: 2000 }, async () => {
  const p = page();
  const slow = p.search('예산');
  const fast = p.search('월요일');
  p.answer(1); await fast;
  p.answer(0); await slow;
  assert.match(p.status.textContent, /^"월요일"/);
  assert.equal(p.results.kids[0].kids[0].kids[0], '월요일 회의');
});

test('검색어를 지운 뒤 늦게 온 옛 결과가 빈 화면을 다시 채우지 않는다', { timeout: 2000 }, async () => {
  const p = page();
  const slow = p.search('예산');
  await p.search('');
  assert.equal(p.status.textContent, '검색어를 넣으세요.');
  p.answer(0); await slow;
  assert.equal(p.status.textContent, '검색어를 넣으세요.');
  assert.equal(p.results.kids.length, 0);
});

test('차례대로 찾으면 매번 그 검색어 결과를 보인다', { timeout: 2000 }, async () => {
  const p = page();
  for (const [i, q] of ['예산', '발표', '금요일'].entries()) {
    const s = p.search(q);
    p.answer(i);
    await s;
    assert.match(p.status.textContent, new RegExp(`^"${q}"`));
  }
});

// 독립 QA 추가 요청: 오류 응답·삭제 뒤 다시 찾기와의 경합
test('늦게 실패한 옛 검색은 오류를 내지 않고 새 결과를 그대로 둔다', { timeout: 2000 }, async () => {
  const p = page();
  const slow = p.search('예산');
  const fast = p.search('월요일');
  p.answer(1); await fast;
  p.fail(0, '서버 오류');
  await slow; // 던지면 화면에 "할 수 없음" 알림이 뜬다
  assert.match(p.status.textContent, /^"월요일"/);
  assert.deepEqual(titles(p), ['월요일 회의']);
});

test('지금 검색이 실패하면 옛 결과를 지우고 실패를 보인다', { timeout: 2000 }, async () => {
  const p = page();
  const first = p.search('예산'); p.answer(0); await first;
  const now = p.search('월요일');
  p.fail(1, '검색어는 100자 이하');
  await now;
  assert.equal(p.status.textContent, '찾지 못함: 검색어는 100자 이하');
  assert.equal(p.results.kids.length, 0);
});

test('회의 삭제 뒤 다시 찾은 결과를 그 전에 보낸 옛 검색 결과가 덮지 않는다', { timeout: 2000 }, async () => {
  const p = page();
  const withDeleted = { query: '예산', results: [{ meeting: { id: 3, title: '지운 회의', status: 'stopped' }, titleMatch: false, segments: [] }, { meeting: { id: 2, title: '남은 회의', status: 'stopped' }, titleMatch: false, segments: [] }], segmentCount: 2, truncated: false };
  const afterDelete = { query: '예산', results: [{ meeting: { id: 2, title: '남은 회의', status: 'stopped' }, titleMatch: false, segments: [] }], segmentCount: 1, truncated: false };
  const old = p.search('예산'); // 지우기 전에 보낸 검색(늦게 옴)
  const refresh = p.search('예산'); // 지운 뒤 화면이 다시 찾음(refreshMeetingSearch)
  p.answer(1, afterDelete); await refresh;
  p.answer(0, withDeleted); await old;
  assert.deepEqual(titles(p), ['남은 회의']);
});

// 독립 QA 추가 구멍: 첫 검색 응답을 기다리는 동안(결과 상자가 비어 있음) 회의를 지우면, 실제 refreshMeetingSearch가
// 결과 개수 0이라 다시 찾지 않아 늦게 온 옛 결과(지운 회의 포함)가 그대로 보였다. 실제 함수를 거쳐 확인한다.
test('첫 검색 응답 전에 회의를 지워도 다시 찾아, 늦게 온 옛 결과가 지운 회의를 보이지 않는다', { timeout: 2000 }, async () => {
  const p = page();
  const withDeleted = { query: '예산', results: [{ meeting: { id: 3, title: '지운 회의', status: 'stopped' }, titleMatch: false, segments: [] }, { meeting: { id: 2, title: '남은 회의', status: 'stopped' }, titleMatch: false, segments: [] }], segmentCount: 2, truncated: false };
  const afterDelete = { query: '예산', results: [{ meeting: { id: 2, title: '남은 회의', status: 'stopped' }, titleMatch: false, segments: [] }], segmentCount: 1, truncated: false };
  const first = p.search('예산'); // 아직 응답 없음 → 결과 상자 비어 있음
  assert.equal(p.results.childElementCount, 0);
  const r = p.refresh(); // 회의를 지운 뒤 화면이 부름
  assert.equal(r.ran, true, '결과가 아직 없어도 다시 찾아야 함');
  p.answer(r.call, afterDelete); await r.done;
  p.answer(0, withDeleted); await first;
  assert.deepEqual(titles(p), ['남은 회의']);
});

test('검색한 적이 없거나 검색어가 비어 있으면 회의를 지워도 새로 찾지 않는다', { timeout: 2000 }, async () => {
  const p = page();
  assert.equal(p.refresh().ran, false, '검색한 적 없음');
  const s = p.search('예산'); p.answer(1); await s; // 0번은 위 refresh가 씀
  const cleared = p.search(''); await cleared;
  assert.equal(p.refresh().ran, false, '검색어를 비움');
});
