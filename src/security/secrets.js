// 흔한 비밀 키 형태를 거르는 휴리스틱. 완전하지 않다.
const PATTERNS = [
  /\bsk-(ant-)?[A-Za-z0-9_-]{16,}/,
  /\bxai-[A-Za-z0-9]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(api[_-]?key|secret|password|token)\s*[:=]\s*\S{8,}/i,
];

export function looksLikeSecret(text) {
  if (typeof text !== 'string') return false;
  if (PATTERNS.some((p) => p.test(text))) return true;
  // 공백 없는 32자 이상 영숫자 덩어리에 숫자·대소문자가 섞이면 키로 본다.
  for (const tok of text.split(/\s+/)) {
    if (tok.length >= 32 && /^[A-Za-z0-9_\-+/=.]+$/.test(tok)
      && /[0-9]/.test(tok) && /[a-z]/.test(tok) && /[A-Z]/.test(tok)) return true;
  }
  return false;
}
