// 로컬 Ollama 실제 검사. 자동 검사(npm test)에는 넣지 않는다. 사용자 승인 후 수동 실행.
// 사용: node scripts/ollama-smoke.js <모델>   (기본 주소 http://127.0.0.1:11434, JARVIS_OLLAMA_BASE_URL로 변경)
// 개인 자료 없는 고정 문장만 보낸다. 외부 주소로는 보내지 않는다.
import { ProviderRegistry } from '../src/providers/registry.js';
import { isLoopback } from '../src/providers/http.js';

const model = process.argv[2] ?? process.env.JARVIS_OLLAMA_MODEL;
if (!model) {
  console.error('모델 이름이 필요함: node scripts/ollama-smoke.js <모델>');
  process.exit(2);
}
const env = { JARVIS_OLLAMA_BASE_URL: process.env.JARVIS_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', JARVIS_OLLAMA_MODEL: model };
if (!isLoopback(env.JARVIS_OLLAMA_BASE_URL)) {
  console.error('이 검사는 로컬 주소에서만 실행함');
  process.exit(2);
}
const reg = ProviderRegistry.fromEnv({ env });
const results = [];

async function check(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Math.round(performance.now() - t0), ...detail });
  } catch (e) {
    results.push({ name, ok: false, ms: Math.round(performance.now() - t0), error: `${e.code ?? ''} ${e.message}` });
  }
}

const ask = { messages: [{ role: 'user', content: '하늘이 파란 이유를 한 문장으로 설명해 줘.' }] };

await check('한국어 스트리밍 응답', async () => {
  const t0 = performance.now();
  let first = null;
  let pieces = 0;
  const out = await reg.collect('ollama', ask, {
    onDelta: () => { pieces += 1; if (first === null) first = Math.round(performance.now() - t0); },
  });
  if (!out.text.trim()) throw new Error('빈 응답');
  if (!/[가-힣]/.test(out.text)) throw new Error('한글 없음');
  return { firstDeltaMs: first, pieces, finishReason: out.finishReason, text: out.text.trim().slice(0, 200) };
});

await check('첫 조각 뒤 취소', async () => {
  const ac = new AbortController();
  let after = 0;
  let got = 0;
  try {
    await reg.collect('ollama', { messages: [{ role: 'user', content: '1부터 50까지 한 줄에 하나씩 써 줘.' }] }, {
      signal: ac.signal,
      onDelta: () => { if (ac.signal.aborted) after += 1; got += 1; if (got === 1) ac.abort(); },
    });
    throw new Error('취소되지 않고 끝남');
  } catch (e) {
    if (e.code !== 'cancelled') throw e;
  }
  await new Promise((r) => setTimeout(r, 300));
  if (after !== 0) throw new Error(`취소 뒤 조각 ${after}개`);
  return { deltasBeforeCancel: got, deltasAfterCancel: after };
});

await check('없는 모델은 not_found', async () => {
  const bad = ProviderRegistry.fromEnv({ env: { ...env, JARVIS_OLLAMA_MODEL: 'jarvis-no-such-model:0b' } });
  try {
    await bad.collect('ollama', ask);
  } catch (e) {
    if (e.code === 'not_found') return { code: e.code };
    throw e;
  }
  throw new Error('오류가 나지 않음');
});

console.log(JSON.stringify({ model, at: new Date().toISOString(), results }, null, 2));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
