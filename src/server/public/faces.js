// 얼굴 알아보기의 계산과 보관 형식(2026-11-14 사용자 결정: 얼굴 정보는 등록한 그 기기 브라우저에만 저장).
// - 사진은 저장하지 않는다. 얼굴 인식 모델이 만든 숫자 128개(얼굴 특징)만 사람마다 몇 개 저장한다.
// - 등록은 본인 동의를 확인한 사람만(consentAt 필수). 사람별·전체 지우기 가능.
// - 이 파일은 계산만 한다. 카메라·모델 실행은 화면(jarvis.html)이 한다.

export const DESCRIPTOR_LENGTH = 128;
export const MAX_PEOPLE = 10;
export const SAMPLES = 5; // 등록할 때 찍는 얼굴 수
export const MATCH_THRESHOLD = 0.5; // 이보다 가까우면 같은 사람(face-api 권장 0.6보다 엄격)
export const STORE_KEY = 'jarvis.faces.v1';

const okVector = (v) => Array.isArray(v) && v.length === DESCRIPTOR_LENGTH && v.every((x) => typeof x === 'number' && Number.isFinite(x));

export function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

// 저장된 글(JSON) → 검사를 통과한 사람 목록. 깨진 항목은 버린다.
export function parseFaces(text) {
  let raw;
  try { raw = JSON.parse(text ?? '[]'); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim() && typeof p.consentAt === 'string'
      && Array.isArray(p.samples) && p.samples.length > 0 && p.samples.every(okVector))
    .slice(0, MAX_PEOPLE)
    .map((p) => ({ id: p.id, name: p.name.trim().slice(0, 20), consentAt: p.consentAt, samples: p.samples }));
}

// 사람 더하기: 이름 1~20자, 동의 확인, 얼굴 특징 1개 이상. 같은 이름이면 그 사람의 얼굴을 바꾼다.
export function addPerson(list, { id, name, consent, samples, now }) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n) throw new Error('이름을 적어 주세요.');
  if (n.length > 20) throw new Error('이름은 20자까지 적을 수 있어요.');
  if (consent !== true) throw new Error('얼굴을 등록하려면 그 사람의 동의가 필요해요.');
  const vecs = (samples ?? []).map((s) => Array.from(s));
  if (!vecs.length || !vecs.every(okVector)) throw new Error('얼굴을 찍지 못했어요. 다시 찍어 주세요.');
  const rest = list.filter((p) => p.name !== n);
  if (rest.length >= MAX_PEOPLE) throw new Error(`최대 ${MAX_PEOPLE}명까지 등록할 수 있어요.`);
  return [...rest, { id, name: n, consentAt: now, samples: vecs }];
}

export function removePerson(list, id) {
  return list.filter((p) => p.id !== id);
}

// 가장 가까운 사람. 기준보다 멀면 null(모르는 사람).
export function bestMatch(list, descriptor, threshold = MATCH_THRESHOLD) {
  if (!descriptor || descriptor.length !== DESCRIPTOR_LENGTH) return null;
  let best = null;
  for (const p of list) {
    for (const s of p.samples) {
      const d = distance(s, descriptor);
      if (!best || d < best.distance) best = { id: p.id, name: p.name, distance: d };
    }
  }
  return best && best.distance < threshold ? best : null;
}
