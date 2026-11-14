// WAV 머리글 읽기. whisper.cpp가 바로 읽는 형식(16kHz·모노·16비트 PCM)인지 판단한다.
export function parseWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let pos = 12;
  let fmt = null;
  let dataBytes = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      dataBytes = Math.min(size, buf.length - body);
      break;
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || dataBytes == null) return null;
  return { ...fmt, dataBytes, seconds: fmt.sampleRate && fmt.channels && fmt.bits ? dataBytes / (fmt.sampleRate * fmt.channels * (fmt.bits / 8)) : 0 };
}

export function isWhisperReady(info) {
  return Boolean(info && info.format === 1 && info.channels === 1 && info.sampleRate === 16000 && info.bits === 16);
}

// 16kHz·모노·16비트 PCM 무음/소리 WAV 만들기(검사용).
export function makeWav(samples, sampleRate = 16000) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
