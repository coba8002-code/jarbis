// 에코 판단(T219). 듣기 모드에서 마이크가 JARVIS가 스피커로 읽는 답을 다시 들은 것인지 본다.
// OS 음성 합성(Windows System.Speech, macOS say)은 브라우저 밖에서 소리를 내므로 브라우저 에코 제거가 이 소리를 지우지 못한다.
// 그래서 받아 적은 글을 "방금 읽은 글"과 비교한다. 받아 적은 글의 두 글자 묶음 대부분이 읽은 글에 있으면 에코로 본다.
// 멈춤 말("멈춰", "그만" 등)이 있으면 읽은 글과 겹쳐도 사용자 말로 본다(끼어들기는 늘 가능해야 함).
const STOP_WORDS = /(멈춰|멈추|그만|잠깐|스톱|조용|stop|wait)/i;

function norm(s) {
  return String(s ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function bigrams(s) {
  const out = [];
  for (let i = 0; i + 1 < s.length; i += 1) out.push(s.slice(i, i + 2));
  return out;
}

// heard: 받아 적은 글, spoken: 방금(지금 포함) 스피커로 읽은 글.
// 돌려줌: { echo, overlap(0~1), reason }
export function checkEcho(heard, spoken, { minOverlap = 0.6 } = {}) {
  const h = norm(heard);
  const s = norm(spoken);
  if (!s) return { echo: false, overlap: 0, reason: 'nothing_spoken' };
  if (!h) return { echo: true, overlap: 1, reason: 'empty' }; // 말소리 없음: 읽는 소리였다고 본다
  if (STOP_WORDS.test(String(heard))) return { echo: false, overlap: 0, reason: 'stop_word' };
  const hb = h.length < 2 ? [h] : bigrams(h);
  const sb = new Set(s.length < 2 ? [s] : bigrams(s));
  const hit = hb.filter((b) => sb.has(b)).length;
  const overlap = Number((hit / hb.length).toFixed(2));
  return { echo: overlap >= minOverlap, overlap, reason: overlap >= minOverlap ? 'matches_spoken' : 'different' };
}

function overlapOf(h, s) {
  if (!h || !s) return 0;
  const hb = h.length < 2 ? [h] : bigrams(h);
  const sb = new Set(s.length < 2 ? [s] : bigrams(s));
  return hb.filter((b) => sb.has(b)).length / hb.length;
}

// 시간을 맞춘 에코 판단(아이디어 출처: isair/jarvis, 방식만 참고).
// 기기가 말한 글(spoken: { text, startedAt, endedAt|null }, ms)과 들린 말의 시간(utterStartAt·utterEndAt)을 맞춰,
// 그 시간에 읽고 있었을 부분과 비교한다. 말 앞부분만 에코이고 뒤에 사람 말이 붙어 있으면 그 뒤 말(kept)을 살린다.
// 돌려줌: { echo, kept, reason }  kept: 사람 말로 볼 글(에코면 '')
export function checkEchoTimed(heard, spoken, { utterStartAt, utterEndAt, charsPerSec = 7, slack = 15, afterMs = 1500 } = {}) {
  const raw = String(heard ?? '').trim();
  const h = norm(raw);
  if (!spoken || !norm(spoken.text)) return { echo: false, kept: raw, reason: 'nothing_spoken' };
  if (!h) return { echo: true, kept: '', reason: 'empty' };
  const s = norm(spoken.text);
  const end = spoken.endedAt ?? Infinity;
  if (utterStartAt > end + afterMs) return { echo: false, kept: raw, reason: 'after_speech' };
  // 그 시간에 읽던 부분(앞뒤 여유 slack 글자)
  const from = Math.max(0, Math.floor(((utterStartAt - spoken.startedAt) / 1000) * charsPerSec) - slack);
  const to = Math.min(s.length, Math.ceil(((Math.min(utterEndAt, end) - spoken.startedAt) / 1000) * charsPerSec) + slack);
  const part = utterStartAt >= end ? s.slice(-40) : s.slice(from, Math.max(from + 2, to));
  if (overlapOf(h, part) >= 0.6) return { echo: true, kept: '', reason: 'matches_timed' };
  if (h.length >= 10 && overlapOf(h, s) >= 0.7) return { echo: true, kept: '', reason: 'matches_spoken' };
  // 앞부분이 에코고 뒤에 사람 말이 붙은 경우: 앞 낱말 묶음이 읽은 글과 거의 같으면 그 뒤만 남긴다.
  const words = raw.split(/\s+/).filter(Boolean);
  for (let k = words.length - 1; k >= 1; k -= 1) {
    const head = norm(words.slice(0, k).join(' '));
    if (head.length >= 4 && overlapOf(head, s) >= 0.7) {
      const rest = words.slice(k).join(' ');
      if (norm(rest).length >= 3) return { echo: false, kept: rest, reason: 'salvaged' };
      return { echo: true, kept: '', reason: 'mostly_echo' };
    }
  }
  return { echo: false, kept: raw, reason: 'different' };
}
