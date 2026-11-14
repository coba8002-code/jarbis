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
