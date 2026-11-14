// 말소리 구간 판단(발화 감지). 브라우저 화면과 Node 검사에서 같이 쓴다(외부 의존 없음).
// 소리 크기(RMS, 0~1)를 일정 간격으로 넣으면 말 시작·끝을 알려 준다.
// - start: 기준보다 큰 소리가 startMs 이상 이어지면
// - end: 시작 뒤 기준보다 작은 소리가 endSilenceMs 이상 이어지거나, 전체가 maxMs를 넘으면
// 주변 소음에 맞춰 기준을 조금씩 올린다(noiseFloor × ratio, 최소 threshold).
export function createSegmenter({ threshold = 0.02, ratio = 3, startMs = 150, endSilenceMs = 1200, maxMs = 30000 } = {}) {
  let noise = threshold / ratio;
  let speaking = false;
  let loudSince = null;
  let quietSince = null;
  let startedAt = null;
  return {
    get speaking() { return speaking; },
    level() { return Math.max(threshold, noise * ratio); },
    // rms: 0~1, now: ms. 'start' | 'end' | null 을 돌려준다.
    push(rms, now) {
      const level = Math.max(threshold, noise * ratio);
      const loud = rms >= level;
      if (!speaking) {
        if (!loud) noise = noise * 0.95 + rms * 0.05; // 조용할 때만 소음 기준을 배운다
        if (loud) {
          loudSince ??= now;
          if (now - loudSince >= startMs) {
            speaking = true;
            startedAt = loudSince;
            quietSince = null;
            return 'start';
          }
        } else {
          loudSince = null;
        }
        return null;
      }
      if (now - startedAt >= maxMs) {
        speaking = false; loudSince = null; quietSince = null;
        return 'end';
      }
      if (loud) {
        quietSince = null;
      } else {
        quietSince ??= now;
        if (now - quietSince >= endSilenceMs) {
          speaking = false; loudSince = null; quietSince = null;
          return 'end';
        }
      }
      return null;
    },
    reset() { speaking = false; loudSince = null; quietSince = null; startedAt = null; },
  };
}

// 녹음 앞부분 잘림 대책(T232). 말 시작을 알아채기까지(최소 startMs) 이미 지나간 소리를 잃지 않도록,
// 마이크 소리(PCM)를 늘 preRollMs만큼 미리 담아 두고 녹음을 시작하면 그 앞 소리부터 함께 담는다.
// 결과는 16kHz 모노 16비트 WAV(받아쓰기 엔진이 바로 쓰는 형식이라 서버에서 변환하지 않는다).
export function createPcmCapture({ inputRate, outputRate = 16000, preRollMs = 800, maxMs = 35000 } = {}) {
  if (!(inputRate > 0)) throw new Error('inputRate가 필요함');
  const preMax = Math.round((inputRate * preRollMs) / 1000);
  const recMax = Math.round((inputRate * maxMs) / 1000);
  let ring = [];
  let ringLen = 0;
  let rec = null;
  let recLen = 0;
  const join = (parts, len) => {
    const all = new Float32Array(len);
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.length; }
    return all;
  };
  return {
    get recording() { return rec !== null; },
    // 지금까지 담은 녹음 길이(ms, 미리 담은 소리 포함)
    get recordedMs() { return (recLen / inputRate) * 1000; },
    // 오디오 처리 단위마다 부른다. 브라우저가 버퍼를 다시 쓰므로 복사해 둔다.
    push(samples) {
      const copy = Float32Array.from(samples);
      if (rec) {
        if (recLen < recMax) { rec.push(copy); recLen += copy.length; }
        return;
      }
      ring.push(copy);
      ringLen += copy.length;
      while (ring.length > 1 && ringLen - ring[0].length >= preMax) ringLen -= ring.shift().length;
    },
    // preRoll: true면 미리 담아 둔 소리(최대 preRollMs)부터 녹음에 넣는다.
    start({ preRoll = true } = {}) {
      rec = [];
      recLen = 0;
      if (preRoll && ringLen > 0) {
        const extra = Math.max(0, ringLen - preMax);
        if (extra > 0) ring[0] = ring[0].subarray(extra);
        rec = ring;
        recLen = ringLen - extra;
      }
      ring = [];
      ringLen = 0;
    },
    // 녹음을 멈추지 않고 지금까지의 WAV를 만든다(에코 확인용).
    wav() { return encodeWav(downsample(join(rec ?? [], recLen), inputRate, outputRate), outputRate); },
    stop() {
      const out = this.wav();
      rec = null;
      recLen = 0;
      return out;
    },
  };
}

// 구간 평균으로 표본 수를 줄이고 16비트 정수로 바꾼다.
export function downsample(samples, fromRate, toRate) {
  const ratio = fromRate / toRate;
  const n = Math.floor(samples.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.min(samples.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = a; j < b; j += 1) sum += samples[j];
    const v = Math.max(-1, Math.min(1, sum / (b - a)));
    out[i] = Math.round(v < 0 ? v * 0x8000 : v * 0x7fff);
  }
  return out;
}

// 16비트 모노 PCM → WAV 바이트
export function encodeWav(pcm, rate) {
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const v = new DataView(bytes.buffer);
  const ascii = (at, s) => { for (let i = 0; i < s.length; i += 1) bytes[at + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i += 1) v.setInt16(44 + i * 2, pcm[i], true);
  return bytes;
}

export function rmsOf(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
