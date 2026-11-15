import { PROVIDER_NAMES, ProviderError, validateRequest } from './contract.js';
import { createHttpProviders } from './adapters.js';

// 실제 어댑터는 사용자 키·비용·전송 승인 뒤에 만든다. 지금은 네트워크 없이 not_configured를 던진다.
function placeholder(name) {
  return {
    name,
    async *stream(request) {
      validateRequest(name, request);
      throw new ProviderError('not_configured', name, `${name} 공급자는 아직 연결되지 않음`);
    },
  };
}

export class ProviderRegistry {
  constructor(extra = {}) {
    this.providers = Object.fromEntries(PROVIDER_NAMES.map((n) => [n, placeholder(n)]));
    Object.assign(this.providers, extra);
  }

  // HTTP 어댑터를 쓰는 등록부. 기본은 외부 주소 차단(JARVIS_ALLOW_REMOTE=1 필요).
  static fromEnv(options = {}) {
    return new ProviderRegistry(createHttpProviders(options));
  }

  // 공급자 정보. 알 수 없으면 안전하게 외부로 본다.
  describe(name) {
    const provider = this.providers[name];
    if (!provider) throw new ProviderError('not_configured', name, `공급자 ${name} 없음`);
    // 설정이 없는 자리 표시자는 화면에서 고를 수 없게 ready:false로 알린다(AI 고르기, 2026-11-15)
    return { name, baseUrl: 'unknown', model: null, remote: true, ...(provider.describe ? {} : { ready: false, reason: '연결되지 않음' }), ...(provider.describe?.() ?? {}) };
  }

  names() {
    return Object.keys(this.providers);
  }

  // 지정한 공급자만 쓴다. 실패해도 다른 공급자로 자동 전송하지 않는다.
  // expect: { baseUrl, model } — 승인한 대상. 어댑터가 보내기 직전에 확인한다.
  async collect(name, request, { signal, onDelta, expect } = {}) {
    const provider = this.providers[name];
    if (!provider) throw new ProviderError('not_configured', name, `공급자 ${name} 없음`);
    let text = '';
    for await (const ev of provider.stream(request, expect ? { signal, expect } : { signal })) {
      if (ev.type === 'delta') {
        text += ev.text;
        onDelta?.(ev.text);
      } else if (ev.type === 'done') {
        return { provider: name, text, finishReason: ev.finishReason };
      }
    }
    throw new ProviderError('internal', name, '끝 신호 없이 응답이 끝남');
  }
}
