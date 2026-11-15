import fs from 'node:fs';
import path from 'node:path';
// 받은 음성(WAV)의 소리 크기 진단(2026-11-15, 토스 프론트 마이크 점검).
// JARVIS_AUDIO_DIAG=1 일 때만 서버 로그에 길이·RMS·피크·0인 샘플 비율을 한 줄 남긴다. 기본은 음성을 저장하지 않는다(아래 DIAG_DIR을 줄 때만).
// rms·peak는 0~1(16비트 최대값 기준). zeros가 1에 가깝고 peak가 0이면 마이크에서 아무 신호도 오지 않은 것(배선·믹서 꺼짐).
export function wavLevels(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return { ok: false, bytes: buf?.length ?? 0, reason: 'not_wav' };
  }
  let off = 12; let fmt = null; let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(buf.length, body + size));
      break;
    }
    off = body + size + (size % 2);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) return { ok: false, bytes: buf.length, reason: 'unsupported', fmt };
  const n = Math.floor(data.length / 2);
  let sum = 0; let peak = 0; let zeros = 0;
  for (let i = 0; i < n; i++) {
    const v = data.readInt16LE(i * 2);
    sum += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (v === 0) zeros++;
  }
  const frames = n / Math.max(1, fmt.channels);
  return {
    ok: true, bytes: buf.length, rate: fmt.rate, channels: fmt.channels,
    ms: Math.round((frames / fmt.rate) * 1000),
    rms: n ? Math.sqrt(sum / n) / 32768 : 0,
    peak: peak / 32768,
    zeros: n ? zeros / n : 1,
  };
}

// JARVIS_AUDIO_DIAG_DIR=<폴더>를 주면 마지막 음성 한 개만 그 폴더에 last-<경로>.wav로 덮어쓴다(이 PC 안에서만, 진단 끝나면 지울 것).
export function logAudioDiag(route, buf, env = process.env, log = console.log) {
  if (env.JARVIS_AUDIO_DIAG !== '1') return null;
  const l = wavLevels(buf);
  if (env.JARVIS_AUDIO_DIAG_DIR && Buffer.isBuffer(buf)) {
    try {
      fs.mkdirSync(env.JARVIS_AUDIO_DIAG_DIR, { recursive: true });
      fs.writeFileSync(path.join(env.JARVIS_AUDIO_DIAG_DIR, `last-${route.replace(/[^a-z]+/gi, '-').replace(/^-|-$/g, '')}.wav`), buf);
    } catch { /* 진단 저장 실패는 무시 */ }
  }
  if (l.ok) log(`[audio-diag] ${route} bytes=${l.bytes} ms=${l.ms} rate=${l.rate} ch=${l.channels} rms=${l.rms.toFixed(5)} peak=${l.peak.toFixed(4)} zeros=${(l.zeros * 100).toFixed(1)}%`);
  else log(`[audio-diag] ${route} bytes=${l.bytes} ${l.reason}`);
  return l;
}
