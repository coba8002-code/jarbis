// 네 공급자 HTTP 어댑터. 외부 패키지 없이 fetch만 쓴다.
// 기본으로 외부(루프백 아닌) 주소에는 보내지 않는다. JARVIS_ALLOW_REMOTE=1 이 있어야 보낸다.
// 키 값은 환경 변수에서 요청 때만 읽고, 저장·기록하지 않는다.
import { ProviderError, validateRequest, throwIfAborted } from './contract.js';
import { isLoopback, send, readSse, readLines, parseJson, redact } from './http.js';

export const PROVIDER_DEFAULTS = {
  openai: { baseUrl: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY', model: null },
  claude: { baseUrl: 'https://api.anthropic.com', keyEnv: 'ANTHROPIC_API_KEY', model: 'claude-opus-5-5' },
  grok: { baseUrl: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY', model: null },
  ollama: { baseUrl: 'http://127.0.0.1:11434', keyEnv: null, model: null },
  // llama.cpp llama-server(OpenAI 호환). 모델 이름은 서버가 무시하므로 기본 'local'. 바꾸려면 JARVIS_LLAMA_BASE_URL·JARVIS_LLAMA_MODEL.
  llama: { baseUrl: 'http://127.0.0.1:8080/v1', keyEnv: null, model: 'local' },
};
// 화면에 보일 이름(2026-11-15: 메인 화면에서 AI 고르기)
export const PROVIDER_LABELS = { claude: 'Claude', openai: 'Codex(OpenAI)', grok: 'Grok', ollama: '로컬(Ollama)', llama: 'Llama(llama.cpp)' };

const ANTHROPIC_VERSION = '2026-10-21';

function envName(name, field) {
  return `JARVIS_${name.toUpperCase()}_${field}`;
}

// 설정을 확인한다. 실패하면 네트워크를 쓰기 전에 not_configured를 던진다.
// expect: 승인한 대상 { baseUrl, model }. 있으면 지금 설정과 같을 때만 보낸다(D7).
function resolve(name, env, request, expect) {
  const d = PROVIDER_DEFAULTS[name];
  const baseUrl = (env[envName(name, 'BASE_URL')] ?? d.baseUrl).replace(/\/+$/, '');
  const model = request.model ?? env[envName(name, 'MODEL')] ?? d.model ?? null;
  if (expect && (expect.baseUrl !== baseUrl || (expect.model ?? null) !== model)) {
    throw new ProviderError('target_changed', name, '보낼 주소나 모델이 승인한 대상과 다름');
  }
  if (!model) {
    throw new ProviderError('not_configured', name, `모델이 지정되지 않음 (${envName(name, 'MODEL')})`);
  }
  if (!isLoopback(baseUrl) && env.JARVIS_ALLOW_REMOTE !== '1') {
    throw new ProviderError('not_configured', name, '외부 전송 승인 전이라 외부 주소로 보내지 않음 (JARVIS_ALLOW_REMOTE)');
  }
  let key = null;
  if (d.keyEnv) {
    key = env[d.keyEnv];
    if (!key) throw new ProviderError('not_configured', name, `키가 없음 (${d.keyEnv})`);
  }
  return { baseUrl, model, key };
}

function openAiCompatible(name, env, fetchImpl) {
  return {
    name,
    async *stream(request, { signal, expect } = {}) {
      validateRequest(name, request);
      throwIfAborted(name, signal);
      const { baseUrl, model, key } = resolve(name, env, request, expect);
      const res = await send(name, fetchImpl, `${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model, messages: request.messages, stream: true }),
      }, { signal, secrets: key ? [key] : [] });
      let finish = null;
      for await (const ev of readSse(name, res.body, signal)) {
        if (ev.data === '[DONE]') {
          yield { type: 'done', finishReason: finish ?? 'stop' };
          return;
        }
        const msg = parseJson(name, ev.data);
        if (msg.error) throw new ProviderError('internal', name, redact(msg.error.message, [key]));
        const choice = msg.choices?.[0];
        if (choice?.delta?.content) yield { type: 'delta', text: choice.delta.content };
        if (choice?.finish_reason) finish = choice.finish_reason;
      }
      throw new ProviderError('internal', name, '끝 신호 없이 응답이 끝남');
    },
  };
}

const CLAUDE_STREAM_ERRORS = {
  overloaded_error: 'unavailable',
  api_error: 'unavailable',
  rate_limit_error: 'rate_limit',
  authentication_error: 'auth',
  permission_error: 'auth',
  invalid_request_error: 'bad_request',
  not_found_error: 'not_found',
};

function claude(env, fetchImpl) {
  const name = 'claude';
  return {
    name,
    async *stream(request, { signal, expect } = {}) {
      validateRequest(name, request);
      throwIfAborted(name, signal);
      const { baseUrl, model, key } = resolve(name, env, request, expect);
      const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const messages = request.messages.filter((m) => m.role !== 'system');
      const body = { model, max_tokens: request.maxTokens ?? 64000, stream: true, messages };
      if (system) body.system = system;
      const res = await send(name, fetchImpl, `${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify(body),
      }, { signal, secrets: [key] });
      let stop = null;
      for await (const ev of readSse(name, res.body, signal)) {
        const msg = parseJson(name, ev.data);
        if (msg.type === 'content_block_delta' && msg.delta?.type === 'text_delta') {
          yield { type: 'delta', text: msg.delta.text };
        } else if (msg.type === 'message_delta') {
          stop = msg.delta?.stop_reason ?? stop;
        } else if (msg.type === 'message_stop') {
          if (stop === 'refusal') throw new ProviderError('refused', name, '모델이 요청을 거절함');
          yield { type: 'done', finishReason: stop ?? 'end_turn' };
          return;
        } else if (msg.type === 'error') {
          const code = CLAUDE_STREAM_ERRORS[msg.error?.type] ?? 'internal';
          throw new ProviderError(code, name, redact(msg.error?.message, [key]));
        }
      }
      throw new ProviderError('internal', name, '끝 신호 없이 응답이 끝남');
    },
  };
}

function ollama(env, fetchImpl) {
  const name = 'ollama';
  const noThink = new Set(); // 생각(think)을 받지 않는 모델(주소|모델)
  return {
    name,
    async *stream(request, { signal, expect } = {}) {
      validateRequest(name, request);
      throwIfAborted(name, signal);
      const { baseUrl, model } = resolve(name, env, request, expect);
      // request.think가 true/false로 정해졌을 때만 넘긴다(생각 끄기 = 빠른 답, T097). 없으면 모델 기본값.
      // format('json')·options(temperature 등)·keepAlive: 판정처럼 짧은 JSON 답이 필요할 때만 넘긴다.
      // 생각(think)을 모르는 모델(gemma3 등)은 400 "does not support thinking"을 돌려주므로, 한 번만 think 없이 다시 보내고 기억한다(2026-11-15 토스 기기 옆 PC).
      const body = (withThink) => JSON.stringify({
        model, messages: request.messages, stream: true,
        ...(withThink ? { think: request.think } : {}),
        ...(request.format === 'json' ? { format: 'json' } : {}),
        ...(request.options && typeof request.options === 'object' ? { options: request.options } : {}),
        ...(typeof request.keepAlive === 'string' ? { keep_alive: request.keepAlive } : {}),
      });
      const key = `${baseUrl}|${model}`;
      const useThink = typeof request.think === 'boolean' && !noThink.has(key);
      const post = (withThink) => send(name, fetchImpl, `${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body(withThink),
      }, { signal, secrets: [] });
      let res;
      try {
        res = await post(useThink);
      } catch (e) {
        if (!useThink || e.code !== 'bad_request' || !/does not support thinking/i.test(e.message)) throw e;
        noThink.add(key);
        res = await post(false);
      }
      for await (const line of readLines(name, res.body, signal)) {
        if (!line.trim()) continue;
        const msg = parseJson(name, line);
        if (msg.error) throw new ProviderError('internal', name, redact(msg.error));
        if (msg.message?.content) yield { type: 'delta', text: msg.message.content };
        if (msg.done) {
          yield { type: 'done', finishReason: msg.done_reason ?? 'stop' };
          return;
        }
      }
      throw new ProviderError('internal', name, '끝 신호 없이 응답이 끝남');
    },
  };
}

// 네트워크 없이 바로 쓸 수 있는지 본다(키 값은 읽기만 하고 내보내지 않음). 실패 이유는 고칠 설정 이름만 알린다.
export function readiness(name, env) {
  const d = PROVIDER_DEFAULTS[name];
  const baseUrl = (env[envName(name, 'BASE_URL')] ?? d.baseUrl).replace(/\/+$/, '');
  const model = env[envName(name, 'MODEL')] ?? d.model ?? null;
  if (!model) return { ready: false, reason: `모델 이름이 없음(${envName(name, 'MODEL')})` };
  if (!isLoopback(baseUrl) && env.JARVIS_ALLOW_REMOTE !== '1') return { ready: false, reason: '외부 전송이 꺼져 있음(JARVIS_ALLOW_REMOTE=1 필요)' };
  if (d.keyEnv && !env[d.keyEnv]) return { ready: false, reason: `키가 없음(${d.keyEnv})` };
  return { ready: true, reason: '' };
}

// 보낼 주소와 외부 여부. 루프백이 아니면 외부로 본다(Ollama 포함).
function describeFor(name, env) {
  const baseUrl = (env[envName(name, 'BASE_URL')] ?? PROVIDER_DEFAULTS[name].baseUrl).replace(/\/+$/, '');
  const model = env[envName(name, 'MODEL')] ?? PROVIDER_DEFAULTS[name].model;
  return { name, label: PROVIDER_LABELS[name] ?? name, baseUrl, model, remote: !isLoopback(baseUrl), ...readiness(name, env) };
}

export function createHttpProviders({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const providers = {
    openai: openAiCompatible('openai', env, fetchImpl),
    claude: claude(env, fetchImpl),
    grok: openAiCompatible('grok', env, fetchImpl),
    ollama: ollama(env, fetchImpl),
    llama: openAiCompatible('llama', env, fetchImpl),
  };
  // Ollama에 받아 둔 모델 목록(라마·젬마 등). 이 기기 안 주소일 때만 묻는다. 실패하면 빈 목록.
  providers.ollama.models = async () => {
    const baseUrl = (env[envName('ollama', 'BASE_URL')] ?? PROVIDER_DEFAULTS.ollama.baseUrl).replace(/\/+$/, '');
    if (!isLoopback(baseUrl)) return [];
    try {
      const res = await fetchImpl(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return [];
      const j = await res.json();
      return (Array.isArray(j.models) ? j.models : []).map((m) => ({ name: String(m.name ?? ''), size: Number(m.size) || 0, family: String(m.details?.family ?? '') })).filter((m) => m.name);
    } catch { return []; }
  };
  for (const [name, p] of Object.entries(providers)) {
    p.describe = () => describeFor(name, env);
  }
  // 이 PC 안 서버(Llama·Ollama)는 설정만 보지 않고 실제로 켜져 있는지 짧게 묻는다(2026-11-15: llama-server가 꺼져 있는데 "쓸 수 있음"으로 보이던 문제).
  const cache = new Map();
  for (const name of ['llama', 'ollama']) {
    providers[name].probe = async () => {
      const baseUrl = (env[envName(name, 'BASE_URL')] ?? PROVIDER_DEFAULTS[name].baseUrl).replace(/\/+$/, '');
      if (!isLoopback(baseUrl)) return { ready: true, reason: '' }; // 외부 주소는 묻지 않는다
      const hit = cache.get(name);
      if (hit && Date.now() - hit.at < PROBE_CACHE_MS) return hit.r;
      const host = new URL(baseUrl).host;
      let r;
      try {
        const res = await fetchImpl(name === 'ollama' ? `${baseUrl}/api/tags` : `${baseUrl}/models`, { signal: AbortSignal.timeout(1500) });
        if (!res.ok) {
          await res.body?.cancel?.().catch?.(() => {});
          r = { ready: false, reason: `${PROVIDER_LABELS[name]} 서버가 제대로 답하지 않음(HTTP ${res.status})` };
        } else {
          // 같은 포트에 다른 프로그램(예: 8080의 Open WebUI)이 있을 수 있어 모델 목록 모양인지 본다
          let j = null;
          try { j = JSON.parse((await res.text()).slice(0, 200_000)); } catch { j = null; }
          const okShape = name === 'ollama' ? Array.isArray(j?.models) : Array.isArray(j?.data);
          r = okShape ? { ready: true, reason: '' } : { ready: false, reason: `${host}에 ${name === 'llama' ? 'llama-server' : 'Ollama'}가 아닌 다른 프로그램이 있음` };
        }
      } catch {
        r = { ready: false, reason: name === 'llama' ? `이 PC에 llama-server가 켜져 있지 않음(${host})` : `이 PC에 Ollama가 켜져 있지 않음(${host})` };
      }
      cache.set(name, { at: Date.now(), r });
      return r;
    };
  }
  return providers;
}
export const PROBE_CACHE_MS = 15_000;

// 목록 보기용: 설정으로는 쓸 수 있어도, 실제로 물어볼 수 있는 것(probe)은 켜져 있는지까지 본다.
export async function describeLive(registry) {
  return Promise.all(registry.names().map(async (n) => {
    const d = registry.describe(n);
    const p = registry.providers?.[n];
    if (d.ready === false || typeof p?.probe !== 'function') return d;
    const r = await p.probe();
    return r.ready ? d : { ...d, ...r };
  }));
}
