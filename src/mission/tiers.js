// 작업 위험 단계(아이디어 출처: OpenJarvis approval tiers, Apache-2.0 — 방식만 참고해 새로 짬).
// 단계는 AI가 아니라 이 표(PC 규칙)로 정한다. 표에 없는 작업은 "높음".
// 헌법: 승인은 정확한 내용 버전에 묶는다 → "항상 허락" 같은 기억된 규칙은 두지 않는다.
// 낮음: 이 기기 안에서 읽기만 하는 일(한꺼번에 승인 가능). 높음: 외부 전송·바꾸기·지우기·실행.
export const TIERS = {
  low: { label: '낮음', note: '이 기기 안에서 읽기만 해요. 외부로 보내지 않아요.' },
  high: { label: '높음', note: '외부로 보내거나 무언가를 바꿀 수 있어요. 하나씩 확인해 주세요.' },
};

const BY_KIND = {
  'mock.echo': 'low',
  'mock.fail': 'low',
  'local.memory.search': 'low',
  'local.meeting.search': 'low',
  'provider.send': 'high',
};

export function tierOf(kind) {
  return BY_KIND[kind] ?? 'high';
}

export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
