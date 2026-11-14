import { ProviderError, validateRequest, throwIfAborted } from './contract.js';

// 네트워크를 쓰지 않는 모의 공급자. 계약 검사용.
// options.chunks: 돌려줄 조각 목록, options.failWith: 오류 코드, options.failAfter: 몇 조각 뒤 실패할지
export function createMockProvider(name = 'mock', options = {}) {
  const { chunks = ['안녕하세요', '. ', '모의 응답입니다.'], failWith = null, failAfter = 0, delayMs = 1 } = options;
  return {
    name,
    describe: () => ({ name, baseUrl: 'local:mock', model: null, remote: false }),
    async *stream(request, { signal } = {}) {
      validateRequest(name, request);
      throwIfAborted(name, signal);
      let sent = 0;
      for (const text of chunks) {
        if (failWith && sent >= failAfter) throw new ProviderError(failWith, name, `모의 ${failWith} 오류`);
        await new Promise((r) => setTimeout(r, delayMs));
        throwIfAborted(name, signal);
        yield { type: 'delta', text };
        sent += 1;
      }
      if (failWith) throw new ProviderError(failWith, name, `모의 ${failWith} 오류`);
      yield { type: 'done', finishReason: 'stop' };
    },
  };
}
