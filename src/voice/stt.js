// 받아쓰기(STT). whisper.cpp의 whisper-server를 JARVIS가 직접 띄우고 관리한다. Windows·macOS 공통.
// - 서버는 127.0.0.1의 빈 포트에만, 처음 받아쓸 때 띄우고 JARVIS가 꺼질 때 끈다(다른 프로그램이 쓰지 않게 짧게 유지).
// - 설정: 한국어, VAD 켬(무음에서 말 지어내기 방지), 영문 프롬프트 "JARVIS"(한글 프롬프트는 v1.9.2 서버에서 한글이 깨짐).
// - 음성은 메모리로만 다루고 파일로 저장하지 않는다. 외부로 보내지 않는다.
// - 16kHz 모노 16비트 WAV가 아니면 ffmpeg로 바꾼다.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { AppError } from '../errors.js';
import { parseWav, isWhisperReady } from './wav.js';
import { filterSegments } from './transcript-filter.js';

const PROMPT = 'JARVIS';

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// 받아 적은 글 바로잡기: 이름 "자비스"를 자주 잘못 듣는 형태만 바꾼다(2026-11-14 실측: 차비스·Javis·CHAVIS).
// 실제 낱말과 겹치지 않는 형태만 넣는다. 한국어 조사가 붙어도("차비스야") 바꾼다.
const NAME_KO = /(차비스|쟈비스|짜비스|재비스|자비쓰)/g;
const NAME_EN = /\b(?:jarvis|javis|chavis|charvis|jabis)\b/gi;
export function normalizeTranscript(text, name = '자비스') {
  return String(text).replace(NAME_KO, name).replace(NAME_EN, name);
}

// whisper-server를 띄우는 기본 실행기. { baseUrl, stop } 을 돌려준다.
// prompt: 영문(ASCII)만. 한글 프롬프트는 v1.9.2 서버 응답의 한글을 깨뜨린다(2026-11-14 확인). 빈 글이면 프롬프트 없음.
export function createWhisperLauncher({ server, model, vadModel, language = 'ko', prompt = PROMPT, fetchImpl = globalThis.fetch, readyTimeoutMs = 60000 }) {
  if (prompt && !/^[\x20-\x7e]+$/.test(prompt)) throw new AppError('invalid_input', '받아쓰기 프롬프트는 영문(ASCII)만 쓸 수 있음');
  return async () => {
    if (!server || (server.includes('/') || server.includes('\\')) && !existsSync(server)) {
      throw new AppError('stt_unavailable', `받아쓰기 서버 실행 파일이 없음: ${server ?? '(설정 없음)'}`);
    }
    if (!model || !existsSync(model)) throw new AppError('stt_unavailable', `받아쓰기 모델이 없음: ${model ?? '(설정 없음)'}`);
    if (vadModel && !existsSync(vadModel)) throw new AppError('stt_unavailable', `VAD 모델이 없음: ${vadModel}`);
    const port = await freePort();
    const args = ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-l', language];
    if (prompt) args.push('--prompt', prompt);
    if (vadModel) args.push('--vad', '-vm', vadModel);
    const child = spawn(server, args, { stdio: 'ignore', windowsHide: true });
    let exited = null;
    child.on('exit', (code) => { exited = code ?? -1; });
    const spawnError = new Promise((_, reject) => child.once('error', (e) => reject(new AppError('stt_unavailable', `받아쓰기 서버를 실행할 수 없음: ${e.message}`))));
    const baseUrl = `http://127.0.0.1:${port}`;
    const ready = (async () => {
      const until = Date.now() + readyTimeoutMs;
      while (Date.now() < until) {
        if (exited !== null) throw new AppError('stt_unavailable', `받아쓰기 서버가 바로 꺼짐(코드 ${exited})`);
        try { await fetchImpl(`${baseUrl}/`); return; } catch { await new Promise((r) => setTimeout(r, 250)); }
      }
      throw new AppError('stt_unavailable', '받아쓰기 서버가 제때 준비되지 않음');
    })();
    try {
      await Promise.race([ready, spawnError]);
    } catch (e) {
      child.kill();
      throw e;
    }
    return { baseUrl, stop: () => { if (exited === null) child.kill(); }, isAlive: () => exited === null };
  };
}

// ffmpeg로 16kHz 모노 16비트 WAV로 바꾼다(표준 입출력만 사용, 파일 없음).
export function convertWithFfmpeg(ffmpeg, input, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(ffmpeg, ['-loglevel', 'error', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      reject(new AppError('stt_unavailable', `ffmpeg를 실행할 수 없음: ${e.message}`));
      return;
    }
    const out = [];
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new AppError('stt_failed', '음성 변환 시간 초과')); }, timeoutMs);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(new AppError('stt_unavailable', `ffmpeg를 실행할 수 없음: ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new AppError('invalid_input', `음성 파일을 읽을 수 없음: ${err.trim().slice(0, 160)}`));
      resolve(Buffer.concat(out));
    });
    child.stdin.on('error', () => { /* ffmpeg가 먼저 끝나면 무시 */ });
    child.stdin.end(input);
  });
}

// 소리 없는 구간 빼기(회의록용). VAD를 끄면 시간은 정확하지만 무음에서 "감사합니다." 같은 말을 지어낸다(2026-11-14 실측).
// 구간 안에서 50ms 창의 가장 큰 RMS가 threshold(16비트 기준) 미만이면 무음으로 보고 뺀다.
export function dropSilentSegments(wav, segs, { threshold = 300, windowMs = 50 } = {}) {
  const info = parseWav(wav);
  if (!isWhisperReady(info)) return { kept: segs, silent: 0 };
  const dataStart = wav.length - info.dataBytes;
  const total = info.dataBytes / 2;
  const win = Math.max(1, Math.round(16 * windowMs));
  const loud = (startMs, endMs) => {
    const a = Math.min(total, Math.max(0, Math.floor(startMs * 16)));
    const b = Math.min(total, Math.ceil(endMs * 16));
    for (let w = a; w < b; w += win) {
      let sum = 0;
      const e = Math.min(b, w + win);
      for (let i = w; i < e; i++) { const v = wav.readInt16LE(dataStart + i * 2); sum += v * v; }
      if (Math.sqrt(sum / (e - w)) >= threshold) return true;
    }
    return false;
  };
  const kept = segs.filter((s) => loud(s.startMs, s.endMs));
  return { kept, silent: segs.length - kept.length };
}

export class SpeechToText {
  // launcher: () => Promise<{ baseUrl, stop, isAlive? }>, ffmpeg: 실행 파일 이름(없으면 변환 불가)
  // normalize: 받아 적은 글의 이름 바로잡기(기본 켬)
  constructor({ launcher, ffmpeg = 'ffmpeg', fetchImpl = globalThis.fetch, maxSeconds = 120, normalize = true } = {}) {
    this.normalize = normalize;
    this.launcher = launcher;
    this.ffmpeg = ffmpeg;
    this.fetchImpl = fetchImpl;
    this.maxSeconds = maxSeconds;
    this.server = null;
    this.starting = null;
  }

  async #ensure() {
    if (this.server && (this.server.isAlive?.() ?? true)) return this.server;
    if (!this.launcher) throw new AppError('stt_unavailable', '받아쓰기 엔진이 설정되지 않음');
    if (this.closed) throw new AppError('stt_unavailable', '받아쓰기가 이미 종료됨');
    this.starting ??= this.launcher().then((s) => {
      // 띄우는 사이 JARVIS가 꺼졌으면 바로 끈다(서버가 남지 않게).
      if (this.closed) { s.stop?.(); throw new AppError('stt_unavailable', '받아쓰기가 이미 종료됨'); }
      this.server = s;
      return s;
    }).finally(() => { this.starting = null; });
    return this.starting;
  }

  status() {
    return { running: Boolean(this.server && (this.server.isAlive?.() ?? true)), configured: Boolean(this.launcher) };
  }

  // segments: 시간 구간(ms)도 받기(회의록용). keepWav: 변환한 16kHz WAV를 함께 돌려주기(원음 저장용).
  // maxSeconds: 이 호출의 최대 길이(회의는 더 길게 허용).
  // filter: 헛소리 거르기(transcript-filter.js). 켜면 구간별 확률을 받아 지어낸 말을 빼고, 뺀 것은 filtered로 알린다.
  async transcribe(audio, { segments = false, keepWav = false, maxSeconds = this.maxSeconds, filter = false } = {}) {
    if (!Buffer.isBuffer(audio) || audio.length === 0) throw new AppError('invalid_input', '음성이 비어 있음');
    let wav = audio;
    let converted = false;
    if (!isWhisperReady(parseWav(audio))) {
      if (!this.ffmpeg) throw new AppError('stt_unavailable', '16kHz 모노 WAV만 받을 수 있음(ffmpeg 없음)');
      wav = await convertWithFfmpeg(this.ffmpeg, audio);
      converted = true;
    }
    const info = parseWav(wav);
    if (!isWhisperReady(info)) throw new AppError('invalid_input', '음성 형식을 바꿀 수 없음');
    if (info.seconds > maxSeconds) throw new AppError('invalid_input', `음성이 너무 김(${Math.round(info.seconds)}초, 최대 ${maxSeconds}초)`);
    const send = (srv, format = segments || filter ? 'verbose_json' : 'json') => {
      const form = new FormData();
      form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
      form.append('response_format', format);
      return this.fetchImpl(`${srv.baseUrl}/inference`, { method: 'POST', body: form, redirect: 'manual' });
    };
    let server = await this.#ensure();
    const t0 = performance.now();
    let res;
    try {
      res = await send(server);
    } catch {
      // 엔진이 죽었거나 연결이 끊겼으면(ECONNRESET 등) 남은 엔진을 끄고 한 번만 다시 띄워 재시도한다(2026-11-15 토스 프론트에서 연속 실패).
      server.stop?.();
      this.server = null;
      try {
        server = await this.#ensure();
        // whisper-server v1.9.2는 잡음뿐인 녹음을 verbose_json으로 받으면 죽는다(2026-11-15 실측, 같은 녹음을 json으로는 처리).
        // 그래서 재시도는 구간이 꼭 필요할 때(segments)만 verbose_json, 아니면 json(구간 없음 → 전체 글로 거른다).
        res = await send(server, segments ? 'verbose_json' : 'json');
      } catch (e2) {
        this.server = null; // 다음 요청 때 다시 띄운다
        if (e2 instanceof AppError) throw e2;
        throw new AppError('stt_failed', `받아쓰기 서버 연결 실패: ${e2.cause?.code ?? e2.message}`);
      }
    }
    const body = Buffer.from(await res.arrayBuffer());
    if (!res.ok) throw new AppError('stt_failed', `받아쓰기 실패: HTTP ${res.status}`);
    let text;
    let parsed;
    try {
      parsed = JSON.parse(body.toString('utf8'));
      text = String(parsed.text ?? '').trim();
    } catch {
      throw new AppError('stt_failed', '받아쓰기 응답을 읽을 수 없음');
    }
    const fixed = this.normalize ? normalizeTranscript(text) : text;
    const fix = (s) => (this.normalize ? normalizeTranscript(s) : s);
    // 구간 시간은 초 단위로 온다 → 녹음 시작 기준 ms 정수로 바꾼다. 빈 글 구간은 뺀다.
    if (filter) {
      // 헛소리 거르기: 구간마다 확률·지어낸 문장을 본다. 구간이 없으면(빈 글) 전체 글로 본다.
      const list = (Array.isArray(parsed.segments) ? parsed.segments : []).map((s) => ({
        text: fix(String(s.text ?? '').trim()), rawText: String(s.text ?? '').trim(),
        noSpeechProb: Number(s.no_speech_prob), avgLogprob: Number(s.avg_logprob),
      }));
      const { kept, dropped } = filterSegments(list.length ? list : (fixed ? [{ text: fixed, rawText: text }] : []));
      if (!segments) {
        return {
          text: kept.map((s) => s.text).join(' ').trim(),
          ...(fixed !== text ? { rawText: text } : {}),
          ...(dropped.length ? { filtered: dropped } : {}),
          ...(keepWav ? { wav } : {}),
          seconds: Number(info.seconds.toFixed(2)),
          durationMs: Math.round(info.seconds * 1000),
          ms: Math.round(performance.now() - t0),
          converted,
          broken: text.includes('�'),
        };
      }
    }
    const raw = segments
      ? (Array.isArray(parsed.segments) ? parsed.segments : [])
        .filter((s) => !filter || filterSegments([{ text: String(s.text ?? '').trim(), noSpeechProb: Number(s.no_speech_prob), avgLogprob: Number(s.avg_logprob) }]).kept.length)
        .map((s) => ({ startMs: Math.max(0, Math.round(Number(s.start) * 1000)), endMs: Math.round(Number(s.end) * 1000), text: fix(String(s.text ?? '').trim()) }))
        .filter((s) => s.text && Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs)
        // 문장부호만 있는 구간(실제 whisper가 마침표만 따로 내놓음, 2026-11-14 QA)은 앞 구간에 붙이고, 앞 구간이 없으면 뺀다.
        .reduce((out, s) => {
          if (/[\p{L}\p{N}]/u.test(s.text)) out.push(s);
          else if (out.length) Object.assign(out.at(-1), { text: out.at(-1).text + s.text, endMs: Math.max(out.at(-1).endMs, s.endMs) });
          return out;
        }, [])
      : undefined;
    const quiet = raw ? dropSilentSegments(wav, raw) : null;
    return {
      text: quiet && quiet.silent ? quiet.kept.map((s) => s.text).join(' ') : fixed,
      ...(fixed !== text ? { rawText: text } : {}),
      ...(quiet ? { segments: quiet.kept, silentDropped: quiet.silent } : {}),
      ...(keepWav ? { wav } : {}),
      seconds: Number(info.seconds.toFixed(2)),
      durationMs: Math.round(info.seconds * 1000),
      ms: Math.round(performance.now() - t0),
      converted,
      broken: text.includes('�'),
    };
  }

  close() {
    this.closed = true;
    this.server?.stop?.();
    this.server = null;
  }
}
