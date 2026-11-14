// 회의 마이크 녹음(T123, US5). 화면이 16kHz 모노 16비트 WAV 조각을 차례로 보내면
// 1) 원음 파일 뒤에 바로 붙이고(꺼져도 그때까지 원음이 남음),
// 2) 조각마다 이 기기 안에서 받아 적어, 녹음 시작 기준 시간으로 구간을 넣는다.
// 외부로 보내지 않는다. 조각 받아쓰기가 실패해도 원음은 남기고 녹음은 계속한다.
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, writeSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';

const RATE = 16000;
const BYTES_PER_MS = (RATE * 2) / 1000; // 32
const HEADER = 44;

// 데이터 크기 dataBytes인 16kHz 모노 16비트 WAV 머리글
export function wavHeader(dataBytes) {
  const h = Buffer.alloc(HEADER);
  h.write('RIFF', 0); h.writeUInt32LE(36 + dataBytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(dataBytes, 40);
  return h;
}

// 조각 WAV에서 PCM 부분만 꺼낸다. 16kHz 모노 16비트 PCM만 받는다.
export function pcmOf(wav) {
  if (!Buffer.isBuffer(wav) || wav.length < HEADER || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new AppError('invalid_input', '회의 녹음 조각은 WAV여야 함');
  }
  let pos = 12;
  let fmt = null;
  while (pos + 8 <= wav.length) {
    const id = wav.toString('ascii', pos, pos + 4);
    const size = wav.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ' && body + 16 <= wav.length) {
      fmt = { format: wav.readUInt16LE(body), channels: wav.readUInt16LE(body + 2), rate: wav.readUInt32LE(body + 4), bits: wav.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== RATE || fmt.bits !== 16) {
        throw new AppError('invalid_input', '회의 녹음 조각은 16kHz 모노 16비트 WAV여야 함');
      }
      const end = Math.min(wav.length, body + size);
      return wav.subarray(body, body + ((end - body) - ((end - body) % 2)));
    }
    pos = body + size + (size % 2);
  }
  throw new AppError('invalid_input', 'WAV에 소리 데이터가 없음');
}

// whisper(VAD 없음)는 조각 앞 무음을 첫 구간에 넣어 시작을 0으로 주곤 한다(2026-11-14 실측, 최대 2.5초 앞).
// [fromMs, toMs) 안에서 처음으로 소리 크기(RMS)가 threshold 이상인 50ms 칸의 시작(ms)을 준다. 없으면 null.
export function firstLoudMs(pcm, fromMs, toMs, { threshold = 300, windowMs = 50 } = {}) {
  const per = (RATE / 1000) * windowMs;
  const total = Math.floor(pcm.length / 2);
  for (let ms = fromMs; ms < toMs; ms += windowMs) {
    const a = Math.floor((ms * RATE) / 1000);
    const b = Math.min(total, a + per);
    if (b <= a) break;
    let sum = 0;
    for (let i = a; i < b; i += 1) { const v = pcm.readInt16LE(i * 2); sum += v * v; }
    if (Math.sqrt(sum / (b - a)) >= threshold) return ms;
  }
  return null;
}

export class LiveMeetings {
  // store: MeetingStore, stt: SpeechToText(회의용), maxSeconds: 회의 최대 길이
  constructor(store, stt, { maxSeconds = 2 * 60 * 60 } = {}) {
    this.store = store;
    this.stt = stt;
    this.maxMs = maxSeconds * 1000;
    this.queues = new Map(); // 회의별 받아쓰기 차례(순서 유지)
    this.seqs = new Map(); // 회의별 조각 번호 기록(메모리에만)
  }

  #recording(id) {
    const m = this.store.get(id);
    if (m.status !== 'recording') throw new AppError('invalid_state', `회의 ${id}은(는) 녹음 중이 아님`);
    return m;
  }

  #lengthMs(path) {
    return existsSync(path) ? Math.floor(Math.max(0, statSync(path).size - HEADER) / BYTES_PER_MS) : 0;
  }

  // 녹음 시작: 회의를 만들고 빈 원음 파일(머리글만)을 둔다.
  start(title) {
    const m = this.store.start(title);
    try {
      mkdirSync(this.store.audioDir, { recursive: true });
      writeFileSync(this.store.audioPath(m.id), wavHeader(0));
    } catch (e) {
      this.store.discard(m.id);
      throw new AppError('storage_error', `원음 파일을 만들 수 없음: ${e.code ?? e.message}`);
    }
    return m;
  }

  // 지금까지 붙은 원음 길이(ms)
  lengthMs(id) {
    return this.#lengthMs(this.store.audioPath(id));
  }

  // 조각 하나 붙이기. 원음은 바로 붙이고(요청 순서대로), 받아쓰기는 회의별 차례로 돈다.
  // seq(FR-008b, 2026-11-14): 0부터 하나씩 늘어나는 조각 번호. 응답이 사라져 같은 번호·같은 내용이 다시 오면
  // 다시 붙이거나 받아 적지 않고 처음 결과를 돌려준다(duplicate: true). 같은 번호에 다른 내용, 건너뛴 번호는 거부.
  // seq 없이 부르면 예전처럼 붙인다(중복 방지 없음). 한 회의에서 두 방식을 섞지 않는다.
  // 번호 기록은 메모리에만 둔다. JARVIS가 꺼지면 녹음 중이던 회의는 중단(interrupted)이 되어 더 붙일 수 없다.
  async append(id, wav, { seq } = {}) {
    this.#recording(id);
    const pcm = pcmOf(wav);
    const st = this.seqs.get(id) ?? { mode: null, next: 0, chunks: new Map() };
    this.seqs.set(id, st);
    if (seq === undefined) {
      if (st.mode === 'seq') throw new AppError('invalid_state', '이 회의는 조각 번호(seq)로 녹음 중임');
      st.mode = 'legacy';
      return this.#appendPcm(id, pcm);
    }
    if (!Number.isSafeInteger(seq) || seq < 0) throw new AppError('invalid_input', '조각 번호는 0 이상 정수');
    if (st.mode === 'legacy') throw new AppError('invalid_state', '이 회의는 조각 번호 없이 녹음 중임');
    st.mode = 'seq';
    const hash = createHash('sha256').update(pcm).digest('hex');
    const prev = st.chunks.get(seq);
    if (prev) {
      if (prev.hash !== hash) throw new AppError('invalid_state', `조각 ${seq}에 다른 내용이 왔음`);
      return { ...(await prev.run), duplicate: true };
    }
    if (seq !== st.next) throw new AppError('invalid_state', `조각 번호가 맞지 않음: 다음 조각 번호는 ${st.next}`);
    const run = this.#appendPcm(id, pcm);
    st.chunks.set(seq, { hash, run });
    st.next += 1;
    return { ...(await run), seq };
  }

  // 원음에 붙이는 부분은 바로(동기로) 하고 실패하면 바로 던진다. 받아쓰기는 돌려주는 약속(promise)으로 기다린다.
  #appendPcm(id, pcm) {
    if (pcm.length === 0) return Promise.resolve({ offsetMs: null, durationMs: this.#lengthMs(this.store.audioPath(id)), segments: [] });
    const path = this.store.audioPath(id);
    const offsetMs = this.#lengthMs(path);
    const chunkMs = Math.floor(pcm.length / BYTES_PER_MS);
    if (offsetMs + chunkMs > this.maxMs) throw new AppError('invalid_input', `회의가 최대 길이(${this.maxMs / 60000}분)를 넘음`);
    try {
      appendFileSync(path, pcm);
    } catch (e) {
      throw new AppError('storage_error', `원음 저장 실패: ${e.code ?? e.message}`);
    }
    const run = (this.queues.get(id) ?? Promise.resolve()).catch(() => {}).then(() => this.#transcribe(id, pcm, offsetMs, chunkMs));
    this.queues.set(id, run);
    return run;
  }

  async #transcribe(id, pcm, offsetMs, chunkMs) {
    const out = { offsetMs, durationMs: offsetMs + chunkMs, segments: [] };
    let r;
    try {
      r = await this.stt.transcribe(Buffer.concat([wavHeader(pcm.length), pcm]), { segments: true });
    } catch (e) {
      return { ...out, sttError: e.message };
    }
    for (const s of r.segments ?? []) {
      const end = Math.min(s.endMs, chunkMs);
      let start = Math.min(s.startMs, chunkMs - 1);
      // 구간 앞 무음은 건너뛰어 실제 말 시작에 맞춘다(말머리를 자르지 않게 100ms 앞).
      const loud = firstLoudMs(pcm, start, end);
      if (loud !== null) start = Math.max(start, loud - 100);
      const startMs = offsetMs + start;
      const endMs = offsetMs + end;
      if (endMs <= startMs) continue;
      try {
        out.segments.push(this.store.addSegment(id, { startMs, endMs, text: s.text }));
      } catch (e) {
        if (e.code !== 'invalid_input') throw e; // 순서·길이 규칙에 어긋난 구간만 건너뛴다
      }
    }
    return { ...out, silentDropped: r.silentDropped ?? 0 };
  }

  // 녹음 멈춤: 남은 받아쓰기를 기다리고 원음 머리글의 크기를 맞춘 뒤 멈춘다. 아무 소리도 없으면 회의를 없앤다.
  async stop(id) {
    this.#recording(id);
    await (this.queues.get(id) ?? Promise.resolve()).catch(() => {});
    this.queues.delete(id);
    this.seqs.delete(id);
    const path = this.store.audioPath(id);
    const durationMs = this.#lengthMs(path);
    if (durationMs === 0) {
      this.store.discard(id);
      return { meeting: null, empty: true, segments: [] };
    }
    fixHeader(path);
    const r = this.store.stop(id, durationMs);
    return { ...r, segments: this.store.segments(id) };
  }

  // 앱 시작 때: 녹음 중 꺼진 회의의 원음 머리글 크기를 실제 크기로 맞춰 재생할 수 있게 한다.
  repair(ids) {
    const fixed = [];
    for (const id of ids) {
      try {
        const path = this.store.audioPath(id);
        if (existsSync(path) && statSync(path).size > HEADER) { fixHeader(path); fixed.push(id); }
      } catch { /* 고치지 못한 원음은 그대로 둔다(기록은 남음) */ }
    }
    return fixed;
  }
}

// 원음 파일 머리글의 크기 칸을 실제 데이터 크기로 다시 쓴다(홀수 끝 바이트는 잘라 계산).
export function fixHeader(path) {
  const size = statSync(path).size;
  const data = Math.max(0, size - HEADER);
  const fd = openSync(path, 'r+');
  try {
    writeSync(fd, wavHeader(data - (data % 2)), 0, HEADER, 0);
  } finally {
    closeSync(fd);
  }
}
