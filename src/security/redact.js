// 비밀 값 가리기(아이디어 출처: isair/jarvis, 방식만 참고해 새로 짬). AI에 보내기 전·기록하기 전에 쓴다.
// 구체적인 것부터 먼저 바꿔야 가린 이름이 알기 쉽다(예: GitHub 토큰을 "긴 16진수"보다 먼저).
const RULES = [
  ['이메일', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ['주소 비밀번호', /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, (m, scheme) => `${scheme}[가림]@`],
  ['AWS 키', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Stripe 키', /\b[rsp]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
  ['GitHub 토큰', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['OpenAI 키', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ['Anthropic 키', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ['Google 키', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['Slack 토큰', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ['인증 머리글', /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g, (m, kind) => `${kind} [가림]`],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  // 한글은 \b(낱말 경계)가 먹지 않아 앞 글자를 직접 확인한다.
  // "비밀번호: 값"·"token=값"은 무엇이든 가리고, "비밀번호는 값"·"password 값"은 값에 숫자·기호가 있을 때만(“암호 화폐” 같은 말은 그대로).
  ['비밀 값', /(?<![A-Za-z0-9_가-힣])(password|passwd|pwd|secret|token|api[_-]?key|session|비밀번호|암호)(\s*[:=]\s*)("[^"]+"|'[^']+'|[^\s,]+)/gi, (m, k, sep) => `${k}${sep}[가림]`],
  ['비밀 값', /(?<![A-Za-z0-9_가-힣])(password|passwd|pwd|secret|token|api[_-]?key|비밀번호|암호)((?:은|는)?\s+)((?=[^\s,]*[\d!@#$%^&*])[^\s,]{4,})/gi, (m, k, sep) => `${k}${sep}[가림]`],
  ['카드 번호', /\b(?:\d[ -]?){13,19}\b/g, (m) => (m.replace(/\D/g, '').length >= 13 ? '[가림:카드 번호]' : m)],
  ['인증 번호', /((?:otp|2fa|인증\s*번호|인증\s*코드|code)\D{0,10})\b\d{6}\b/gi, (m, head) => `${head}[가림]`],
  ['긴 16진수', /\b[0-9a-f]{32,}\b/gi],
];

// 돌려줌: { text, count, kinds }
export function redactSecrets(input) {
  let text = String(input ?? '');
  let count = 0;
  const kinds = new Set();
  for (const [name, re, fn] of RULES) {
    text = text.replace(re, (...args) => {
      const out = fn ? fn(...args) : `[가림:${name}]`;
      if (out !== args[0]) { count += 1; kinds.add(name); }
      return out;
    });
  }
  return { text, count, kinds: [...kinds] };
}
