// 주변 대화 듣기 서비스: 받아 적기 → 헛소리 거르기 → 에코·멈춤 판단 → 메모리에 쌓기 → (이름·핫 윈도일 때만) 판정.
// 판정은 이 기기 안 모델(외부 주소가 아닌 Ollama)로만 한다. 없거나 실패하면 규칙으로 정한다(이름·핫 윈도면 받음).
import { AppError } from '../errors.js';
import { AmbientSession, findName, isStopCommand, tokensOf, buildJudgeRequest, parseJudge, ambientContext } from './ambient.js';
import { checkEchoTimed } from './echo.js';
import { looksLikeSecret } from '../security/secrets.js';
import { redactSecrets } from '../security/redact.js';

const BASE_NAME = '자비스';
const ALIASES = ['JARVIS', 'Jarvis', 'jarvis'];
const CONTEXT_TTL_MS = 30_000;

// 판정에 쓸 이 기기 안 모델. Ollama가 루프백 주소일 때만(모의 공급자는 쓰지 않음).
export function localJudgeProvider(providers) {
  try {
    const d = providers.describe('ollama');
    return d.remote ? null : 'ollama';
  } catch {
    return null;
  }
}

// policy: () => { keepAlive, fastModel, lowPower } — 판정 모델·메모리에 두는 시간(services.modelPolicy)
export function createAmbientService({ stt, providers, characters, now = () => Date.now(), judge, judgeTimeoutMs = 10_000, session, policy = () => ({ keepAlive: '30m', fastModel: null, lowPower: false }) } = {}) {
  const s = session ?? new AmbientSession({ now });
  let pending = null; // { context, at }

  const names = () => [BASE_NAME, characters?.active()?.name].filter(Boolean);

  // 판정: 따로 주지 않으면 이 기기 안 Ollama에 짧은 JSON으로 묻는다.
  const runJudge = judge ?? (async (req) => {
    const p = localJudgeProvider(providers);
    if (!p) return null;
    const pol = policy();
    req.keepAlive = pol.keepAlive;
    if (pol.fastModel) req.model = pol.fastModel;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), judgeTimeoutMs);
    try {
      const out = await providers.collect(p, req, { signal: ac.signal });
      return parseJudge(out.text);
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  });

  return {
    session: s,
    status: () => ({
      enabled: s.enabled,
      consentAt: s.consentAt,
      windowSeconds: Math.round(s.windowMs / 1000),
      segments: s.enabled ? s.snapshot().length : 0,
      judge: judge ? 'custom' : (localJudgeProvider(providers) ?? 'rules'),
      names: names(),
    }),
    // 켜기는 동의(consent: true)가 있어야 한다. 끄면 쌓인 말을 바로 지운다.
    set({ enabled, consent }) {
      if (typeof enabled !== 'boolean') throw new AppError('invalid_input', 'enabled는 true 또는 false');
      if (enabled) {
        if (!s.enable({ consent })) throw new AppError('consent_required', '주변 대화 듣기는 본인 동의가 있어야 켤 수 있음');
        // 판정 모델을 미리 메모리에 올려 둔다(첫 판정이 늦지 않게). 실패해도 듣기는 켠다.
        // 저전력 모드면 미리 올리지 않는다.
        const pol = policy();
        const p = judge || pol.lowPower ? null : localJudgeProvider(providers);
        if (p) providers.collect(p, { messages: [{ role: 'user', content: '.' }], think: false, keepAlive: pol.keepAlive, options: { num_predict: 1 }, ...(pol.fastModel ? { model: pol.fastModel } : {}) }).catch(() => {});
      } else {
        s.disable();
        pending = null;
      }
      return this.status();
    },
    // 기기가 소리로 읽기 시작·끝
    spoken({ state, text }) {
      if (state === 'start') s.speakingStarted(text);
      else if (state === 'end') s.speakingEnded();
      else throw new AppError('invalid_input', 'state는 start 또는 end');
      return { speaking: s.speakingNow() };
    },
    // 들린 말 한 마디. utterMs: 말 길이, agoMs: 말이 끝난 뒤 보내기까지 걸린 시간(기기 시계 차이를 피하려고 서버 시각 기준으로 계산)
    async hear(audio, { utterMs = 0, agoMs = 0 } = {}) {
      if (!s.enabled) throw new AppError('ambient_off', '주변 대화 듣기가 꺼져 있음');
      const gen = s.generation;
      const receivedAt = now(); // 받아 적는 시간은 빼고, 받은 순간 기준으로 말한 때를 계산
      const r = await stt.transcribe(audio, { filter: true });
      if (!s.enabled || gen !== s.generation) return { ignored: 'stale' };
      const endAt = receivedAt - Math.max(0, Number(agoMs) || 0);
      const startAt = endAt - Math.max(0, Number(utterMs) || 0);
      const heard = String(r.text ?? '').trim();
      if (!heard) return { heard: '', ignored: r.filtered?.length ? 'filtered' : 'silence', ...(r.filtered ? { filtered: r.filtered } : {}) };
      const echo = s.spoken ? checkEchoTimed(heard, s.spoken, { utterStartAt: startAt, utterEndAt: endAt }) : { echo: false, kept: heard, reason: 'nothing_spoken' };
      // 멈춤 말: 짧은 말이거나 에코가 아니면 바로 멈춘다(긴 에코 안에 "그만"이 들어 있는 것은 무시).
      if (isStopCommand(heard) && (tokensOf(heard).length <= 3 || !echo.echo)) return { heard, stop: true, reason: 'stop_word' };
      if (echo.echo) return { heard, ignored: 'echo', echoReason: echo.reason };
      const text = redactSecrets(echo.kept).text; // 비밀 값(번호·키 등)은 가린 뒤에 쌓는다
      if (looksLikeSecret(text)) return { heard: '', ignored: 'secret' }; // 가려도 비밀처럼 보이면 쌓지 않음
      const duringTts = Boolean(s.spoken && (s.spoken.endedAt === null || startAt <= s.spoken.endedAt));
      const before = s.snapshot();
      const seg = s.add({ text, startAt, endAt, duringTts });
      const nameHit = findName(text, names(), { aliases: ALIASES });
      const hot = s.inHotWindow(startAt);
      if (!nameHit.hit && !hot) return { heard: text, addressed: false, reason: 'ambient' };
      const mode = nameHit.hit ? 'name' : 'hot';
      const req = buildJudgeRequest({ mode, current: text, segments: before, lastSpoken: s.spoken?.text, names: names(), now: now() });
      let verdict = await runJudge(req);
      const how = verdict ? 'model' : 'rules';
      verdict ??= { directed: true, stop: false, confidence: 'low', reason: '판정 모델 없음: 이름·이어 말하기라 받음' };
      if (!s.enabled || gen !== s.generation) return { ignored: 'stale' };
      if (verdict.stop) return { heard: text, stop: true, reason: 'judge_stop' };
      if (!verdict.directed) return { heard: text, addressed: false, reason: mode === 'name' ? 'mentioned' : 'not_directed', verdict, judge: how };
      s.markHandled([...before.map((b) => b.id), seg.id]);
      pending = { context: ambientContext(before.filter((b) => !b.handled), s.spoken?.text, now()), at: now() };
      return { heard: text, addressed: true, question: text, mode, verdict, judge: how };
    },
    // 답할 때 한 번만 쓰는 주변 대화(30초 안). 쓰고 나면 지운다.
    takeContext() {
      const p = pending;
      pending = null;
      if (!p || now() - p.at > CONTEXT_TTL_MS || !s.enabled) return null;
      return p.context;
    },
    // 일시 정지·화면 닫힘: 진행 중인 판단 결과를 버리게 한다.
    bump() { s.generation += 1; pending = null; return { generation: s.generation }; },
  };
}
