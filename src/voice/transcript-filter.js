// 받아 적기 헛소리 거르기(아이디어 출처: isair/jarvis, 방식만 참고).
// whisper는 조용하거나 잡음뿐일 때 말을 지어낸다("시청해 주셔서 감사합니다." 등).
// - 구간의 no_speech_prob(말이 없을 확률)이 noSpeech 이상이면 버림
// - 구간의 avg_logprob(확신도)이 minLogprob 미만이면 버림
// - 흔히 지어내는 문장과 프롬프트("JARVIS")가 새어 나온 조각만 있는 구간은 버림
// 2026-11-14 실측(whisper.cpp v1.9.2): verbose_json 구간에 no_speech_prob·avg_logprob가 있다.
// VAD 없이 잡음만 넣으면 " RVIS"(프롬프트 조각)가 no_speech_prob≈0으로 나와 확률만으로는 못 거른다 → 문장 목록도 함께 쓴다.

const MADE_UP = [
  /^(시청|구독|청취)해\s*주셔서\s*감사합니다$/,
  /^시청\s*해주셔서\s*감사합니다$/,
  /^구독과?\s*좋아요/,
  /^(감사합니다|고맙습니다)$/,
  /^다음\s*(영상|시간)에서\s*(만나요|뵙겠습니다)$/,
  /^(MBC|KBS|SBS|YTN)\s*뉴스/i,
  /^자막\s*(제공|제작)/,
  /^(rvis|arvis|vis|jarv)$/i, // 프롬프트 "JARVIS"가 새어 나온 조각(온전한 "JARVIS"는 사람이 부른 것일 수 있어 남긴다)
];

const clean = (t) => String(t ?? '').replace(/[\s.,!?~…·"'“”‘’]+/g, ' ').trim();

export function isMadeUp(text) {
  const t = clean(text);
  if (!t) return true;
  return MADE_UP.some((re) => re.test(t));
}

// segments: [{ text, rawText?, noSpeechProb?, avgLogprob? }]
// 돌려줌: { kept: [...], dropped: [{ text, reason }] }
export function filterSegments(segments, { noSpeech = 0.5, minLogprob = -0.7 } = {}) {
  const kept = [];
  const dropped = [];
  for (const s of segments) {
    const raw = s.rawText ?? s.text;
    let reason = null;
    if (Number.isFinite(s.noSpeechProb) && s.noSpeechProb >= noSpeech) reason = 'no_speech';
    else if (Number.isFinite(s.avgLogprob) && s.avgLogprob < minLogprob) reason = 'low_confidence';
    else if (isMadeUp(raw)) reason = 'made_up';
    if (reason) dropped.push({ text: s.text, reason });
    else kept.push(s);
  }
  return { kept, dropped };
}
