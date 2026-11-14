// 대화 차례 관리와 끼어들기 (FR-002). 기기 없는 로직만 담는다.
// 상태: idle → thinking(생성 중, 아직 소리 없음) → speaking(재생 중) → idle
// 사용자가 말을 시작하거나 새 질문을 보내면 진행 중인 차례를 끊는다:
//   생성 취소(AbortController) + 재생 중지(player.stop) + 그 차례의 늦게 온 조각은 버림.
// player 계약: play(turnId, text), stop(turnId), finish(turnId).
//   finish는 "이 차례에 더 보낼 소리 없음". 재생기는 남은 소리를 다 낸 뒤 manager.playbackEnded(turnId)를 부른다.

export class TurnManager {
  constructor({ providers, player }) {
    this.providers = providers;
    this.player = player;
    this.state = 'idle';
    this.current = null;
    this.turns = [];
    this.discarded = 0;
    this.listeners = [];
    this.seq = 0;
  }

  on(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }

  #emit(type, data = {}) {
    for (const fn of this.listeners) fn({ type, state: this.state, ...data });
  }

  #setState(state) {
    if (this.state !== state) {
      this.state = state;
      this.#emit('state');
    }
  }

  #interrupt(reason) {
    const turn = this.current;
    if (!turn) return null;
    turn.status = 'interrupted';
    turn.reason = reason;
    turn.abort.abort();
    if (turn.playing) this.player.stop(turn.id);
    this.current = null;
    this.#emit('interrupted', { turnId: turn.id, reason });
    return turn.id;
  }

  // 사용자가 "그만"을 누름(화면 버튼 등). 진행 중인 차례를 끊고 대기로 돌아간다.
  cancel() {
    const cut = this.#interrupt('user_stop');
    this.#setState('idle');
    return cut;
  }

  // 사용자가 말하기 시작함(발화 감지). 진행 중인 차례가 있으면 끊는다.
  userSpeechStarted() {
    const cut = this.#interrupt('user_speech');
    this.#setState('listening');
    return cut;
  }

  // 사용자 발화가 끝나 질문이 정해짐. 새 차례를 시작하고 끝날 때까지 기다린다.
  // signal: 이 차례를 요청한 화면 연결이 끊기면 이 차례만 끊는다(옛 요청이 새 차례를 끊지 않음).
  async submit(provider, request, { signal } = {}) {
    this.#interrupt('new_turn');
    this.seq += 1;
    const turn = {
      id: this.seq,
      provider,
      status: 'thinking',
      text: '',
      playing: false,
      abort: new AbortController(),
    };
    this.turns.push(turn);
    this.current = turn;
    this.#setState('thinking');
    const onGone = () => {
      if (this.current !== turn) return;
      this.#interrupt('client_gone');
      this.#setState('idle');
    };
    signal?.addEventListener('abort', onGone, { once: true });
    if (signal?.aborted) onGone();

    try {
      for await (const ev of this.providers.providers[provider].stream(request, { signal: turn.abort.signal })) {
        if (this.current !== turn) {
          // 공급자가 취소를 무시하고 계속 보내도 화면·재생에 쓰지 않는다.
          this.discarded += 1;
          continue;
        }
        if (ev.type === 'delta') {
          turn.text += ev.text;
          turn.playing = true;
          turn.status = 'speaking';
          this.#setState('speaking');
          this.player.play(turn.id, ev.text);
          this.#emit('delta', { turnId: turn.id, text: ev.text });
        } else if (ev.type === 'done') {
          turn.status = 'generated';
          this.#emit('generated', { turnId: turn.id });
          // 더 보낼 소리가 없음을 알린다. 재생기는 남은 소리를 다 낸 뒤 playbackEnded를 부른다.
          if (turn.playing) this.player.finish(turn.id);
          else this.#finish(turn);
        }
      }
    } catch (e) {
      if (this.current === turn) {
        turn.status = 'failed';
        turn.error = { code: e.code ?? 'internal', message: e.message };
        if (turn.playing) this.player.stop(turn.id);
        this.current = null;
        this.#setState('idle');
        this.#emit('failed', { turnId: turn.id, error: turn.error });
      }
      // 끊긴 차례의 취소 오류는 정상 흐름이라 무시한다.
    } finally {
      signal?.removeEventListener('abort', onGone);
    }
    return this.#publicTurn(turn);
  }

  // 재생기가 그 차례의 소리를 다 냈을 때 부른다. 끊긴 옛 차례의 신호는 무시한다.
  playbackEnded(turnId) {
    const turn = this.current;
    if (!turn || turn.id !== turnId || turn.status !== 'generated') return false;
    this.#finish(turn);
    return true;
  }

  #finish(turn) {
    turn.status = 'done';
    turn.playing = false;
    this.current = null;
    this.#setState('idle');
    this.#emit('done', { turnId: turn.id });
  }

  #publicTurn(turn) {
    const { abort, ...rest } = turn;
    return { ...rest };
  }

  history() {
    return this.turns.map((t) => this.#publicTurn(t));
  }
}
