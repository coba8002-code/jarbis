import { ProviderError } from './contract.js';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLoopback(url) {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

// 응답 문구에 비밀 값이 섞여 나와도 오류 메시지에 남기지 않는다.
export function redact(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets) if (s) out = out.split(s).join('[REDACTED]');
  return out.slice(0, 300);
}

export function codeForStatus(status) {
  if (status === 401 || status === 402 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 529 || status >= 500) return 'unavailable';
  if (status >= 400) return 'bad_request';
  return 'internal';
}

function isAbort(e) {
  return e?.name === 'AbortError' || e?.code === 'ABORT_ERR';
}

// 요청을 보내고 실패를 ProviderError로 바꾼다.
export async function send(provider, fetchImpl, url, init, { signal, secrets }) {
  if (signal?.aborted) throw new ProviderError('cancelled', provider, '요청이 취소됨');
  let res;
  try {
    // 리디렉션을 따라가지 않는다(D8). 승인한 주소 밖으로 요청·개인 자료가 넘어가지 않게 한다.
    res = await fetchImpl(url, { ...init, signal, redirect: 'manual' });
  } catch (e) {
    if (isAbort(e) || signal?.aborted) throw new ProviderError('cancelled', provider, '요청이 취소됨');
    throw new ProviderError('unavailable', provider, `연결 실패: ${redact(e.cause?.code ?? e.message, secrets)}`);
  }
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    let where = '';
    try { where = new URL(res.headers.get('location') ?? '', url).host; } catch { /* 위치 없음 */ }
    try { await res.body?.cancel(); } catch { /* 본문 없음 */ }
    throw new ProviderError('redirect_blocked', provider, `리디렉션 차단: HTTP ${res.status}${where ? ` → ${redact(where, secrets)}` : ''}`);
  }
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* 본문 없음 */ }
    throw new ProviderError(codeForStatus(res.status), provider, `HTTP ${res.status}: ${redact(body, secrets)}`);
  }
  if (!res.body) throw new ProviderError('internal', provider, '응답 본문 없음');
  return res;
}

// 응답 본문을 줄 단위로 읽는다. 취소되면 cancelled를 던진다.
export async function* readLines(provider, body, signal) {
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for await (const chunk of body) {
      if (signal?.aborted) throw new ProviderError('cancelled', provider, '요청이 취소됨');
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        yield line;
      }
    }
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (isAbort(e) || signal?.aborted) throw new ProviderError('cancelled', provider, '요청이 취소됨');
    throw new ProviderError('unavailable', provider, `응답 읽기 실패: ${e.message}`);
  }
  buf += decoder.decode();
  if (buf) yield buf.replace(/\r$/, '');
}

// SSE 줄을 {event, data} 묶음으로 바꾼다.
export async function* readSse(provider, body, signal) {
  let event = null;
  let data = [];
  for await (const line of readLines(provider, body, signal)) {
    if (line === '') {
      if (data.length) yield { event, data: data.join('\n') };
      event = null;
      data = [];
    } else if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (data.length) yield { event, data: data.join('\n') };
}

export function parseJson(provider, text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError('internal', provider, '응답 JSON을 읽을 수 없음');
  }
}
