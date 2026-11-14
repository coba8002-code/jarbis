// 클라우드 공급자 실제 검사. 자동 검사(npm test)에는 넣지 않는다. 사용자 승인 후 수동 실행.
// 사용: node scripts/cloud-smoke.js <claude|openai|grok ...> [--yes-send]
// --yes-send 가 없으면 보낼 대상·내용·영향만 보여 주고 아무것도 보내지 않는다.
// 키는 환경 변수 또는 프로젝트의 .env.local(사용자가 직접 작성, 공유 제외)에서 읽는다. 키 값은 출력하지 않는다.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ProviderRegistry } from '../src/providers/registry.js';
import { PROVIDER_DEFAULTS } from '../src/providers/adapters.js';

const envFile = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const send = args.includes('--yes-send');
const names = args.filter((a) => !a.startsWith('--'));
const CLOUD = ['claude', 'openai', 'grok'];
if (names.length === 0 || names.some((n) => !CLOUD.includes(n))) {
  console.error(`공급자를 고르세요: ${CLOUD.join(', ')}`);
  process.exit(2);
}

const QUESTION = '1 더하기 1은? 숫자만 답해.';
const COUNT = '1부터 30까지 쉼표로 이어서 써.';

function plan(name) {
  const d = PROVIDER_DEFAULTS[name];
  const env = process.env;
  return {
    공급자: name,
    대상: (env[`JARVIS_${name.toUpperCase()}_BASE_URL`] ?? d.baseUrl),
    모델: env[`JARVIS_${name.toUpperCase()}_MODEL`] ?? d.model ?? '(없음: 설정 필요)',
    키: env[d.keyEnv] ? `${d.keyEnv} 있음` : `${d.keyEnv} 없음`,
    보낼_내용: [QUESTION, `${COUNT} (첫 조각 뒤 취소)`, `${QUESTION} (일부러 틀린 키)`],
    영향: '고정 시험 문장만 보냄. 개인 자료·기억 없음. 요청 3번 분량의 요금이 발생함',
  };
}

if (!send) {
  console.log(JSON.stringify({ 실행: '보내지 않음 (--yes-send 없음)', 계획: names.map(plan) }, null, 2));
  process.exit(0);
}

const env = { ...process.env, JARVIS_ALLOW_REMOTE: '1' };
const reg = ProviderRegistry.fromEnv({ env });
const report = [];

async function check(provider, name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    report.push({ provider, name, ok: true, ms: Math.round(performance.now() - t0), ...detail });
  } catch (e) {
    report.push({ provider, name, ok: false, ms: Math.round(performance.now() - t0), error: `${e.code ?? ''} ${e.message}` });
  }
}

for (const name of names) {
  const keyEnv = PROVIDER_DEFAULTS[name].keyEnv;
  // 진짜 키나 모델이 없으면 그 공급자에는 아무 요청도 보내지 않는다(틀린 키 검사 포함).
  const p = plan(name);
  if (!env[keyEnv] || p.모델.startsWith('(없음')) {
    report.push({ provider: name, name: '사전 확인', ok: false, sent: 0, error: `${p.키}, 모델 ${p.모델} — 보내지 않음` });
    continue;
  }
  await check(name, '스트리밍 응답', async () => {
    const t0 = performance.now();
    let first = null;
    const out = await reg.collect(name, { messages: [{ role: 'user', content: QUESTION }], maxTokens: 4000 }, {
      onDelta: () => { if (first === null) first = Math.round(performance.now() - t0); },
    });
    if (!out.text.includes('2')) throw new Error(`예상 밖 응답: ${out.text.slice(0, 80)}`);
    return { firstDeltaMs: first, finishReason: out.finishReason, text: out.text.trim().slice(0, 80) };
  });

  await check(name, '첫 조각 뒤 취소', async () => {
    const ac = new AbortController();
    let got = 0;
    let after = 0;
    try {
      await reg.collect(name, { messages: [{ role: 'user', content: COUNT }], maxTokens: 4000 }, {
        signal: ac.signal,
        onDelta: () => { if (ac.signal.aborted) after += 1; got += 1; if (got === 1) ac.abort(); },
      });
      throw new Error('취소되지 않고 끝남');
    } catch (e) {
      if (e.code !== 'cancelled') throw e;
    }
    await new Promise((r) => setTimeout(r, 300));
    if (after) throw new Error(`취소 뒤 조각 ${after}개`);
    return { deltasBeforeCancel: got, deltasAfterCancel: after };
  });

  await check(name, '틀린 키는 auth', async () => {
    const bad = ProviderRegistry.fromEnv({ env: { ...env, [keyEnv]: 'jarvis-invalid-test-key' } });
    try {
      await bad.collect(name, { messages: [{ role: 'user', content: QUESTION }], maxTokens: 50 });
    } catch (e) {
      if (e.code === 'auth') return { code: e.code };
      throw e;
    }
    throw new Error('오류가 나지 않음');
  });
}

console.log(JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
process.exitCode = report.every((r) => r.ok) ? 0 : 1;
