// PC 점검(아이디어 출처: OpenJarvis `jarvis doctor`·/health, Apache-2.0 — 방식만 참고해 새로 짬).
// 항목마다 정상(ok)·주의(warn)·실패(fail)와 고치는 방법(hint)을 알려 준다. 아무것도 바꾸거나 내려받지 않는다.
// 사용: node src/main.js --doctor  또는 화면 서버의 GET /api/health
import { accessSync, constants, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const withTimeout = async (p, ms) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await p(ac.signal); } finally { clearTimeout(t); }
};
const looksLikePath = (p) => typeof p === 'string' && (p.includes('/') || p.includes('\\'));

export async function runDoctor({ env = process.env, dataDir, whisper = {}, ffmpeg = 'ffmpeg', fetchImpl = globalThis.fetch, runImpl = spawnSync } = {}) {
  const checks = [];
  const add = (id, name, state, detail, hint = null) => checks.push({ id, name, state, detail, ...(hint ? { hint } : {}) });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', 'Node.js', major >= 24 ? 'ok' : 'fail', `v${process.versions.node}`, major >= 24 ? null : 'Node.js 24 이상을 설치해 주세요.');

  if (dataDir) {
    try { accessSync(dataDir, constants.W_OK); add('data', '데이터 폴더', 'ok', dataDir); } catch { add('data', '데이터 폴더', 'fail', `${dataDir} 에 쓸 수 없음`, '폴더 권한을 확인하거나 --data로 다른 폴더를 주세요.'); }
  }

  // Ollama: 켜져 있는지(/api/tags, 2초)와 정한 모델이 있는지
  const base = (env.JARVIS_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = env.JARVIS_OLLAMA_MODEL ?? null;
  try {
    const res = await withTimeout((signal) => fetchImpl(`${base}/api/tags`, { signal, redirect: 'manual' }), 2000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const names = ((await res.json()).models ?? []).map((m) => m.name);
    if (!model) add('ollama', '대화 모델(Ollama)', 'warn', `켜져 있음 · 모델 ${names.length}개`, 'JARVIS_OLLAMA_MODEL에 쓸 모델 이름을 적어 주세요.');
    else if (names.includes(model) || names.includes(`${model}:latest`)) add('ollama', '대화 모델(Ollama)', 'ok', `켜져 있음 · ${model}`);
    else add('ollama', '대화 모델(Ollama)', 'warn', `켜져 있지만 ${model} 모델이 없음`, `받으려면: ollama pull ${model} (내려받기라 직접 실행해 주세요)`);
  } catch (e) {
    add('ollama', '대화 모델(Ollama)', 'fail', `${base}에 연결 안 됨 (${e.name === 'AbortError' ? '2초 안에 답 없음' : e.cause?.code ?? e.message})`, 'Ollama를 켜 주세요(ollama serve 또는 Ollama 앱 실행).');
  }

  // 받아쓰기(whisper.cpp): 실행 파일·모델 파일이 있는지
  const file = (id, name, p, hint) => {
    if (!p) return add(id, name, 'warn', '설정 없음', hint);
    if (!looksLikePath(p)) return add(id, name, 'warn', `${p} (PATH에서 찾음, 확인 못 함)`, hint);
    return existsSync(p) ? add(id, name, 'ok', p) : add(id, name, 'fail', `${p} 없음`, hint);
  };
  file('whisper', '받아쓰기 실행 파일', whisper.server, 'Windows는 tools/whisper에, macOS는 brew install whisper-cpp. JARVIS_WHISPER_SERVER로 바꿀 수 있어요.');
  file('whisper-model', '받아쓰기 모델', whisper.model, 'JARVIS_WHISPER_MODEL에 모델 파일 경로를 적어 주세요.');
  if (whisper.vadModel !== undefined) file('whisper-vad', '말소리 감지 모델(VAD)', whisper.vadModel, 'JARVIS_WHISPER_VAD에 VAD 모델 파일 경로를 적어 주세요.');

  // ffmpeg: 음성 형식 바꾸기(없어도 16kHz WAV는 됨)
  const ff = runImpl(ffmpeg, ['-version'], { timeout: 3000, windowsHide: true, encoding: 'utf8' });
  if (ff.error || ff.status !== 0) add('ffmpeg', '음성 형식 변환(ffmpeg)', 'warn', '실행할 수 없음', '음성 파일 가져오기에 필요해요. ffmpeg를 설치하거나 JARVIS_FFMPEG로 경로를 적어 주세요.');
  else add('ffmpeg', '음성 형식 변환(ffmpeg)', 'ok', String(ff.stdout).split('\n')[0].slice(0, 60));

  add('remote', '외부 전송', env.JARVIS_ALLOW_REMOTE === '1' ? 'warn' : 'ok', env.JARVIS_ALLOW_REMOTE === '1' ? '외부 공급자로 보낼 수 있음(JARVIS_ALLOW_REMOTE=1)' : '외부 주소로 보내지 않음');

  const summary = { ok: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.state] += 1;
  return { summary, checks };
}

export function formatDoctor({ summary, checks }) {
  const mark = { ok: '정상', warn: '주의', fail: '실패' };
  const lines = checks.map((c) => `[${mark[c.state]}] ${c.name}: ${c.detail}${c.hint ? `\n        → ${c.hint}` : ''}`);
  lines.push(`정상 ${summary.ok} · 주의 ${summary.warn} · 실패 ${summary.fail}`);
  return lines.join('\n');
}
