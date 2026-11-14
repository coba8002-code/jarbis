// 음성 재생기. TurnManager의 player 계약(play, stop, finish)을 따른다.
// speaker 계약: speak(text) → { done: Promise, kill() }. 실제 OS 합성기나 가짜 스피커를 끼운다.
// 재생이 끝나면 onEnded(turnId)를 부른다(보통 manager.playbackEnded).
import { SentenceBuffer } from './sentences.js';

export class SpeechPlayer {
  constructor({ speaker, onEnded = () => {}, onError = () => {}, now = () => Date.now() }) {
    this.speaker = speaker;
    this.onEnded = onEnded;
    this.onError = onError;
    this.turn = null;
    this.now = now;
    this.spoken = []; // 스피커로 보낸 문장 { text, endAt } (에코 판단용, 최근 몇 개만)
  }

  // 지금 읽는 문장과 끝난 지 windowMs 안 된 문장(에코 판단용, T219).
  recentText(windowMs = 8000) {
    const t = this.now();
    return this.spoken.filter((x) => x.endAt == null || t - x.endAt <= windowMs).map((x) => x.text).join(' ');
  }

  #begin(turnId) {
    if (this.turn && this.turn.id !== turnId) this.stop(this.turn.id);
    if (!this.turn) {
      this.turn = { id: turnId, buffer: new SentenceBuffer(), queue: [], handle: null, finished: false, ended: false };
    }
    return this.turn;
  }

  play(turnId, text) {
    const t = this.#begin(turnId);
    t.queue.push(...t.buffer.push(text));
    this.#pump(t);
  }

  finish(turnId) {
    const t = this.turn;
    if (!t || t.id !== turnId) return;
    t.queue.push(...t.buffer.flush());
    t.finished = true;
    this.#pump(t);
  }

  // 끼어들기: 지금 말하는 것을 끊고 남은 문장을 버린다.
  stop(turnId) {
    const t = this.turn;
    if (!t || t.id !== turnId) return;
    t.queue.length = 0;
    t.stopped = true;
    if (t.handle) t.handle.kill();
    this.turn = null;
  }

  #pump(t) {
    if (t.stopped || t.handle) return;
    if (t.queue.length === 0) {
      if (t.finished && !t.ended) {
        t.ended = true;
        if (this.turn === t) this.turn = null;
        this.onEnded(t.id);
      }
      return;
    }
    const sentence = t.queue.shift();
    const said = { text: sentence, endAt: null };
    this.spoken.push(said);
    this.spoken.splice(0, this.spoken.length - 8);
    const handle = this.speaker.speak(sentence);
    t.handle = handle;
    handle.done
      .catch((e) => { if (!t.stopped) this.onError(t.id, e); })
      .finally(() => {
        said.endAt = this.now();
        t.handle = null;
        this.#pump(t);
      });
  }
}
