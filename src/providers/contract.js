// 공급자 공통 계약. specs/001-jarvis-hybrid/contracts/provider.md 참고.
// llama(2026-11-15 사용자 요청): llama.cpp llama-server 같은 OpenAI 호환 로컬 서버(기본 127.0.0.1:8080, 키 없음)
export const PROVIDER_NAMES = ['openai', 'claude', 'grok', 'ollama', 'llama'];
export const ERROR_CODES = ['not_configured', 'auth', 'rate_limit', 'unavailable', 'bad_request', 'not_found', 'refused', 'cancelled', 'target_changed', 'redirect_blocked', 'internal'];

export class ProviderError extends Error {
  constructor(code, provider, message) {
    super(message);
    this.name = 'ProviderError';
    this.code = ERROR_CODES.includes(code) ? code : 'internal';
    this.provider = provider;
  }
}

export function validateRequest(provider, request) {
  if (!request || !Array.isArray(request.messages) || request.messages.length === 0) {
    throw new ProviderError('bad_request', provider, 'messages가 비어 있음');
  }
  for (const m of request.messages) {
    if (!['system', 'user', 'assistant'].includes(m?.role) || typeof m.content !== 'string') {
      throw new ProviderError('bad_request', provider, '잘못된 메시지 형식');
    }
  }
}

export function throwIfAborted(provider, signal) {
  if (signal?.aborted) throw new ProviderError('cancelled', provider, '요청이 취소됨');
}
