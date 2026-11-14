# Provider Contract

```text
provider.name: 'mock' | 'openai' | 'claude' | 'grok' | 'ollama'
provider.stream({ messages:[{role,content}], model?, maxTokens? }, { signal? }) -> AsyncIterable<Event>
Event: { type:'delta', text } | { type:'done', finishReason }
오류: ProviderError { code, provider, message }
code: not_configured | auth | rate_limit | unavailable | bad_request | not_found | refused | cancelled | target_changed | redirect_blocked | internal
```

- signal 중단 시 `cancelled`를 던지고 이후 조각을 내지 않는다.
- 실패해도 다른 공급자로 자동 전송하지 않는다. 호출자는 지정한 공급자만 쓴다.
- ChatGPT 웹 로그인은 API 접근이 아니다. 어댑터는 API 키 방식만 다룬다.

## 등록부

- `new ProviderRegistry()` : 네트워크 없는 자리 표시자(not_configured).
- `ProviderRegistry.fromEnv({ env, fetchImpl })` : HTTP 어댑터(`src/providers/adapters.js`).

## HTTP 어댑터 설정 (환경 변수, 값은 저장하지 않음)

| 공급자 | 기본 주소 | 키 | 모델 |
| --- | --- | --- | --- |
| openai | https://api.openai.com/v1 (`/chat/completions`, SSE) | OPENAI_API_KEY | JARVIS_OPENAI_MODEL 필수 |
| claude | https://api.anthropic.com (`/v1/messages`, SSE, anthropic-version 2026-10-21) | ANTHROPIC_API_KEY | 기본 claude-opus-5-5 |
| grok | https://api.x.ai/v1 (OpenAI 호환) | XAI_API_KEY | JARVIS_GROK_MODEL 필수 |
| ollama | http://127.0.0.1:11434 (`/api/chat`, NDJSON) | 없음 | JARVIS_OLLAMA_MODEL 필수 |

- 주소 변경: `JARVIS_<공급자>_BASE_URL`.
- 루프백이 아닌 주소는 `JARVIS_ALLOW_REMOTE=1`이 없으면 네트워크를 쓰기 전에 `not_configured`로 막는다.
- 키·모델이 없으면 네트워크 없이 `not_configured`.
- 상태 코드: 401·402·403 auth, 404 not_found, 429 rate_limit, 408·5xx·529 unavailable, 그 밖 4xx bad_request.
- Claude 스트림 중 `error` 이벤트는 오류 종류로 분류, `stop_reason: refusal`은 `refused`.
- 오류 문구에 키 값이 섞이면 `[REDACTED]`로 지운다.

## 2026-11-14 추가

- 리디렉션은 따라가지 않는다: 3xx 응답은 `redirect_blocked`.
- `stream(request, { signal, expect })`: expect `{ baseUrl, model }`가 지금 설정과 다르면 보내기 전에 `target_changed`.
- 요청에 `think`(true/false)가 있으면 Ollama `/api/chat`에 그대로 넘긴다. 없으면 보내지 않는다(모델 기본값).
