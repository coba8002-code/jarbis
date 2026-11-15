// 메인 화면(/jarvis)에서 바로 하는 회의 녹음(2026-11-15 사용자 요청: 캐릭터 아래 회의 버튼).
// 설정 화면 회의 탭(index.html)과 같은 방식·같은 API: 조용한 틈에서 15~30초 조각으로 나눠 16kHz WAV로 차례로 보내고,
// 조각마다 번호(seq)를 붙여 다시 보내도 한 번만 붙게 한다(FR-008b). 받아쓰기는 PC 안에서, 원음은 PC에만 저장.
// 마이크 설정은 말하기 버튼과 같다(잡음 줄이기 끔·자동 크기 켬 — 토스 기기 마이크가 작게 들어오는 문제 대응).
export const CHUNK_MIN_MS = 15000;
export const CHUNK_MAX_MS = 30000;
export const MAX_MS = 2 * 60 * 60 * 1000;
export const fmtMs = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

// 조각을 보낼 때인지: 30초가 넘었거나, 15초가 넘었고 지금 말하는 중이 아니면
export const shouldFlush = (recordedMs, speaking) => recordedMs >= CHUNK_MAX_MS || (recordedMs >= CHUNK_MIN_MS && !speaking);

// api(method, path, body): JSON API · token: 화면 토큰 · V: voice-input.js
// on: { tick(ms), segment(seg), status(text), state(recording) }
export function createMeetingRecorder({ api, token, V, on = {}, fetchImpl = (...a) => fetch(...a) }) {
  const r = { id: null, title: '', stream: null, ctx: null, proc: null, cap: null, seg: null, analyser: null, buf: null, timer: null, startedAt: 0, queue: Promise.resolve(), seq: 0, sent: 0, failed: 0, segs: 0, starting: false };
  const emit = (k, v) => { try { on[k]?.(v); } catch { /* 화면 쪽 오류는 녹음에 영향 없음 */ } };

  async function sendChunk(id, wav, seq) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const res = await fetchImpl(`/api/meetings/${id}/chunk?seq=${seq}`, { method: 'POST', headers: { 'x-jarvis-token': token, 'content-type': 'audio/wav' }, body: new Blob([wav], { type: 'audio/wav' }) });
        const data = await res.json();
        if (!res.ok) {
          const err = new Error(data.error?.message ?? '조각 저장 실패');
          err.final = res.status === 400 || res.status === 404 || res.status === 409;
          throw err;
        }
        r.sent += 1;
        for (const s of data.segments ?? []) { r.segs += 1; emit('segment', s); }
        if (data.sttError) emit('status', `일부 받아 적기 실패(원음은 저장함): ${data.sttError}`);
        return;
      } catch (err) {
        if (err.final || attempt >= 3) {
          r.failed += 1;
          emit('status', `녹음 조각을 저장하지 못했어요: ${err.message}`);
          if (err.final && r.id === id && r.timer) stop();
          return;
        }
        await new Promise((ok) => setTimeout(ok, 1000));
      }
    }
  }
  function flush() {
    if (!r.cap || r.cap.recordedMs === 0) return;
    const wav = r.cap.stop();
    r.cap.start({ preRoll: false }); // 같은 순간에 다시 시작해 조각 사이에 빠지는 소리가 없다
    const id = r.id;
    const seq = r.seq;
    r.seq += 1;
    r.queue = r.queue.then(() => sendChunk(id, wav, seq));
  }
  function tick() {
    if (!r.analyser) return;
    r.analyser.getFloatTimeDomainData(r.buf);
    r.seg.push(V.rmsOf(r.buf), performance.now());
    const elapsed = performance.now() - r.startedAt;
    emit('tick', elapsed);
    if (elapsed >= MAX_MS) { stop(); return; }
    if (shouldFlush(r.cap.recordedMs, r.seg.speaking)) flush();
  }

  async function start(title = '') {
    if (r.timer || r.starting) return null;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('이 화면에서는 마이크를 쓸 수 없어요(보안 연결 필요)');
    r.starting = true;
    let stream;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
      } catch (e) {
        throw new Error(e?.name === 'NotAllowedError' ? '마이크 권한이 없어요' : `마이크를 열지 못했어요(${e?.name ?? e})`);
      }
      let m;
      try { m = await api('POST', '/api/meetings/live', title ? { title } : {}); } catch (e) { stream.getTracks().forEach((t) => t.stop()); throw e; }
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const cap = V.createPcmCapture({ inputRate: ctx.sampleRate, maxMs: CHUNK_MAX_MS + 5000 });
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => cap.push(e.inputBuffer.getChannelData(0));
      const mute = ctx.createGain(); // 소리 0으로만 출력에 잇는다(소리를 내지 않음)
      mute.gain.value = 0;
      source.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      cap.start({ preRoll: false });
      Object.assign(r, { id: m.id, title: m.title, stream, ctx, proc, cap, analyser, buf: new Float32Array(analyser.fftSize), seg: V.createSegmenter({ endSilenceMs: 300, maxMs: Infinity }), startedAt: performance.now(), queue: Promise.resolve(), seq: 0, sent: 0, failed: 0, segs: 0 });
      stream.getAudioTracks().forEach((tr) => { tr.onended = () => { emit('status', '마이크 연결이 끊겨 녹음을 끝내요.'); stop(); }; });
      r.timer = setInterval(tick, 100);
      emit('state', true);
      emit('status', `"${m.title}" 녹음 중. 말한 내용이 15~30초마다 PC에서 받아 적혀요.`);
      return m;
    } finally {
      r.starting = false;
    }
  }

  // 끝내기: 남은 조각을 보내고 회의를 마무리한다. 결과: { meeting, segments, empty } (서버 응답) + failed
  async function stop() {
    if (!r.timer) return null;
    clearInterval(r.timer);
    r.timer = null;
    flush();
    r.proc.onaudioprocess = null;
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx.close().catch(() => {});
    emit('state', false);
    const id = r.id;
    emit('status', '남은 녹음을 저장하고 받아 적는 중…');
    await r.queue;
    try {
      const res = await api('POST', `/api/meetings/${id}/stop`);
      return { ...res, failed: r.failed };
    } finally {
      Object.assign(r, { id: null, stream: null, ctx: null, proc: null, cap: null, analyser: null, seg: null });
    }
  }

  return { start, stop, active: () => Boolean(r.timer || r.starting), state: r };
}
