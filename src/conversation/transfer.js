// 개인 자료 외부 전송 승인 (잠정, FR-010a).
// - 외부 공급자 + 기억 포함 → 바로 보내지 않고 승인 대기 미션을 만든다.
// - 미션에는 기억 원문 대신 번호와 해시만 둔다. 실행 때 해시가 같을 때만 보낸다.
// - 로컬 공급자이거나 기억이 없으면 바로 보낸다.
import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';
import { ProviderError } from '../providers/contract.js';
import { needsThinking } from './reasoning.js';
import { redactSecrets } from '../security/redact.js';

export const TRANSFER_KIND = 'provider.send';

function hashOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

// character: { name, persona } | null — 적용한 캐릭터의 말투를 첫 시스템 메시지로 넣는다.
// context: 주변 대화(참고 자료). 이 기기 안 공급자에게만 넣는다(ask에서 확인).
function buildMessages(question, memoryTexts, character, context = null) {
  const messages = [];
  if (character) {
    messages.push({ role: 'system', content: `너는 "${character.name}"(이)라는 캐릭터로 대답한다. 성격·말투: ${character.persona}` });
  }
  if (context) messages.push({ role: 'system', content: context });
  if (memoryTexts.length) {
    messages.push({
      role: 'system',
      content: `사용자에 대해 기억하고 있는 내용:\n${memoryTexts.map((t) => `- ${t}`).join('\n')}`,
    });
  }
  messages.push({ role: 'user', content: question });
  return messages;
}

// 미션 내용 → 실제로 보낼 메시지. 기억이 바뀌었거나 없으면 memory_changed.
export function resolvePayload(memory, content) {
  const texts = content.memories.map(({ id, sha256 }) => {
    let entry;
    try {
      entry = memory.get(id);
    } catch {
      throw new AppError('memory_changed', `기억 ${id}이(가) 지워짐. 새로 요청해야 함`);
    }
    if (hashOf(entry.content) !== sha256) {
      throw new AppError('memory_changed', `기억 ${id}이(가) 승인 뒤 바뀜. 새로 요청해야 함`);
    }
    return entry.content;
  });
  const request = { messages: buildMessages(content.question, texts, content.character ?? null) };
  if (content.model) request.model = content.model;
  return request;
}

// 실행 직전 대상 확인: 승인 때 묶은 주소·외부 여부·모델이 지금 설정과 같아야 한다(D7).
// 재시작이나 환경 설정 변경으로 대상이 바뀌면 보내지 않는다. 대상 정보가 없는 옛 미션도 보내지 않는다.
export function checkTarget(providers, content) {
  if (typeof content.baseUrl !== 'string' || typeof content.remote !== 'boolean') {
    throw new AppError('target_changed', '승인한 전송 대상 정보가 없음. 새로 요청해야 함');
  }
  const now = providers.describe(content.provider);
  if (now.baseUrl !== content.baseUrl) {
    throw new AppError('target_changed', `전송 대상 주소가 승인 뒤 바뀜(${content.baseUrl} → ${now.baseUrl}). 새로 요청해야 함`);
  }
  if (now.remote !== content.remote) {
    throw new AppError('target_changed', '전송 대상의 외부 여부가 승인 뒤 바뀜. 새로 요청해야 함');
  }
  if (content.model == null && now.model != null) {
    throw new AppError('target_changed', `승인 때 없던 모델(${now.model})이 정해짐. 새로 요청해야 함`);
  }
  return { baseUrl: content.baseUrl, model: content.model ?? null };
}

// MissionControl에 등록할 실행기.
export function createTransferExecutor({ memory, providers }) {
  // signal: JARVIS를 끌 때 실행 중인 전송을 멈춘다.
  return async (mission, { signal } = {}) => {
    const expect = checkTarget(providers, mission.content);
    const request = resolvePayload(memory, mission.content);
    // 어댑터도 보내기 직전에 같은 주소·모델인지 한 번 더 확인한다.
    const out = await providers.collect(mission.content.provider, request, { expect, signal });
    return { provider: out.provider, text: out.text, finishReason: out.finishReason };
  };
}

export class Conversation {
  // turns: 소리로 읽을 때 쓰는 TurnManager(선택). 있으면 끼어들기·재생 규칙을 따른다.
  // characters: 적용 캐릭터를 알려 주는 저장소(선택).
  // onExchange: 답을 받은 뒤 { question, answer, remote }를 알린다(기억 제안용, 선택).
  constructor({ missions, memory, providers, turns, characters, onExchange }) {
    this.onExchange = onExchange;
    this.characters = characters;
    this.missions = missions;
    this.memory = memory;
    this.providers = providers;
    this.turns = turns;
  }

  // 진행 중인 글 대화(소리 읽기 꺼짐)의 취소 신호들.
  #inflight = new Set();

  // 진행 중인 글 대화를 모두 끊는다. 끊은 수를 돌려준다.
  stopAll() {
    const n = this.#inflight.size;
    for (const ac of this.#inflight) ac.abort();
    this.#inflight.clear();
    return n;
  }

  // 바로 보낼 때: speak이면 차례 관리자를 거쳐 문장 단위로 읽고, 아니면 글만 모은다.
  // signal: 화면 연결이 끊기면(새로 고침·닫기) 글 대화 생성도 끊는다.
  async #sendNow(provider, request, speak, signal) {
    if (!speak || !this.turns) {
      const ac = new AbortController();
      const onGone = () => ac.abort();
      signal?.addEventListener('abort', onGone, { once: true });
      if (signal?.aborted) ac.abort();
      this.#inflight.add(ac);
      try {
        return await this.providers.collect(provider, request, { signal: ac.signal });
      } catch (e) {
        // 멈추기로 끊긴 답은 오래된 응답이므로 버린다(FR-002).
        if (ac.signal.aborted && e.code === 'cancelled') return { provider, text: '', finishReason: 'interrupted', discarded: true };
        throw e;
      } finally {
        signal?.removeEventListener('abort', onGone);
        this.#inflight.delete(ac);
      }
    }
    this.providers.describe(provider);
    const turn = await this.turns.submit(provider, request, { signal });
    if (turn.status === 'failed') throw new ProviderError(turn.error.code, provider, turn.error.message);
    // 끊긴 답은 오래된 응답이므로 버린다(FR-002, SC-002). 화면에 다시 나오지 않게 글을 돌려주지 않는다.
    if (turn.status === 'interrupted') return { provider, text: '', finishReason: 'interrupted', discarded: true };
    return { provider, text: turn.text, finishReason: 'stop' };
  }

  // fast: 빠른 답(모델의 생각 단계를 끔, 지원하는 공급자만 — 지금은 Ollama). 바로 보내는 대화에만 쓴다.
  // autoThink: 빠른 답이어도 계산·추론으로 보이는 질문은 생각함으로 보낸다(T224).
  // context: 주변 대화(부르면 대답하기). 외부 공급자에는 절대 넣지 않는다(개인 대화 외부 전송 금지).
  async ask({ provider, question, memoryIds = [], model, speak = false, fast = false, autoThink = false, signal, context = null }) {
    if (typeof question !== 'string' || question.trim() === '') {
      throw new AppError('invalid_input', '질문이 비어 있음');
    }
    const info = this.providers.describe(provider);
    const entries = [...new Set(memoryIds)].map((id) => this.memory.get(id));
    const active = this.characters?.active() ?? null;
    const character = active ? { name: active.name, persona: active.persona } : null;

    if (!info.remote || entries.length === 0) {
      // 외부 공급자로 보낼 때는 질문 속 비밀 값(키·비밀번호·카드 번호 등)을 가린다(redact.js).
      const masked = info.remote ? redactSecrets(question.trim()) : { text: question.trim(), count: 0 };
      // k-skill 조회(켜 둔 스킬만, 이 기기 안 공급자일 때만): 필요하면 외부 조회 결과를 참고 자료로 넣는다.
      let skillUse = null;
      if (!info.remote && this.skills) {
        skillUse = await this.skills.maybeAnswer(question.trim()).catch(() => null);
        if (skillUse?.ask) {
          return { status: 'sent', remote: false, spoken: false, fast: Boolean(fast), thinking: { mode: 'skill', reason: null }, reply: { provider, text: skillUse.ask, finishReason: 'stop' }, skill: { name: skillUse.skill, asked: true } };
        }
      }
      const skillNote = skillUse?.context ?? (skillUse?.error ? `외부 조회(k-skill "${skillUse.skill}")가 실패함: ${skillUse.error.message}. 실시간 정보는 확인하지 못했다고 짧게 알린다.` : null);
      const extra = [info.remote ? null : context, skillNote].filter(Boolean).join('\n\n') || null;
      const request = { messages: buildMessages(masked.text, entries.map((e) => e.content), character, extra) };
      if (model) request.model = model;
      let thinking = { mode: 'default', reason: null };
      if (fast) {
        const d = autoThink ? needsThinking(question) : { think: false, reason: null };
        request.think = d.think;
        thinking = { mode: d.think ? 'auto-think' : 'fast', reason: d.reason };
      }
      const out = await this.#sendNow(provider, request, speak, signal);
      if (!out.discarded && out.text) { try { this.onExchange?.({ question: question.trim(), answer: out.text, remote: info.remote }); } catch { /* 기록 실패는 대화에 영향 없음 */ } }
      return { status: 'sent', remote: info.remote, spoken: Boolean(speak && this.turns), fast: Boolean(fast), thinking, reply: out, ...(masked.count ? { redacted: masked.count } : {}), ...(skillUse ? { skill: { name: skillUse.skill, path: skillUse.path ?? null, failed: Boolean(skillUse.error) } } : {}) };
    }

    const mission = this.missions.create({
      kind: TRANSFER_KIND,
      title: `${provider}에 기억 ${entries.length}개를 담아 질문 보내기`,
      target: `provider:${provider} ${info.baseUrl}`,
      content: {
        provider,
        // 승인과 실행 대상을 묶는다: 이 주소·외부 여부·모델로만 보낸다.
        baseUrl: info.baseUrl,
        remote: info.remote,
        model: model ?? info.model ?? null,
        question: question.trim(),
        memories: entries.map((e) => ({ id: e.id, sha256: hashOf(e.content) })),
        ...(character ? { character } : {}),
      },
      impact: `개인 자료(기억 ${entries.length}개)와 질문이 외부 서버(${info.baseUrl})로 전송됨. 공급자 서버에 저장·기록될 수 있음`,
      source: 'chat',
    });
    return { status: 'approval_required', mission, preview: this.preview(mission.id) };
  }

  // 승인 화면용: 실제로 보낼 메시지를 보여 준다.
  preview(missionId) {
    const m = this.missions.get(missionId);
    if (m.kind !== TRANSFER_KIND) throw new AppError('invalid_input', `미션 ${missionId}은(는) 전송 미션이 아님`);
    try {
      checkTarget(this.providers, m.content);
      return { ok: true, request: resolvePayload(this.memory, m.content) };
    } catch (e) {
      return { ok: false, error: { code: e.code, message: e.message } };
    }
  }
}
