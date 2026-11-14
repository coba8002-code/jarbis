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
};

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
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: request.messages, stream: true }),
      }, { signal, secrets: [key] });
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
  return {
    name,
    async *stream(request, { signal, expect } = {}) {
      validateRequest(name, request);
      throwIfAborted(name, signal);
      const { baseUrl, model } = resolve(name, env, request, expect);
      const res = await send(name, fetchImpl, `${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // request.think가 true/false로 정해졌을 때만 넘긴다(생각 끄기 = 빠른 답, T097). 없으면 모델 기본값.
        body: JSON.stringify({ model, messages: request.messages, stream: true, ...(typeof request.think === 'boolean' ? { think: request.think } : {}) }),
      }, { signal, secrets: [] });
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

// 보낼 주소와 외부 여부. 루프백이 아니면 외부로 본다(Ollama 포함).
function describeFor(name, env) {
  const baseUrl = (env[envName(name, 'BASE_URL')] ?? PROVIDER_DEFAULTS[name].baseUrl).replace(/\/+$/, '');
  const model = env[envName(name, 'MODEL')] ?? PROVIDER_DEFAULTS[name].model;
  return { name, baseUrl, model, remote: !isLoopback(baseUrl) };
}

export function createHttpProviders({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const providers = {
    openai: openAiCompatible('openai', env, fetchImpl),
    claude: claude(env, fetchImpl),
    grok: openAiCompatible('grok', env, fetchImpl),
    ollama: ollama(env, fetchImpl),
  };
  for (const [name, p] of Object.entries(providers)) {
    p.describe = () => describeFor(name, env);
  }
  return providers;
}
