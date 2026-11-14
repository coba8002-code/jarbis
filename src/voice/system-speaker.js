// OS 내장 음성 합성. 외부 전송 없음, 녹음 없음.
// Windows: PowerShell + System.Speech(SpeechSynthesizer). macOS: say 명령.
// 글은 표준 입력으로 넘긴다(명령줄에 넣지 않아 특수 문자 문제·주입을 피함).
import { spawn } from 'node:child_process';
import { AppError } from '../errors.js';

const WIN_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '[Console]::InputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Speech',
  '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  'if ($env:JARVIS_TTS_VOICE) { $s.SelectVoice($env:JARVIS_TTS_VOICE) } else {',
  '  $k = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq "ko-KR" } | Select-Object -First 1',
  '  if ($k) { $s.SelectVoice($k.VoiceInfo.Name) }',
  '}',
  'if ($env:JARVIS_TTS_OUT) { $s.SetOutputToWaveFile($env:JARVIS_TTS_OUT) } else { $s.SetOutputToDefaultAudioDevice() }',
  '$s.Speak([Console]::In.ReadToEnd())',
  '$s.Dispose()',
].join('\n');

const WIN_VOICES = [
  'Add-Type -AssemblyName System.Speech',
  '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  '$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + "|" + $_.VoiceInfo.Culture.Name }',
  '$s.Dispose()',
].join('\n');

function run(cmd, args, { input = '', env } = {}) {
  let child;
  const done = new Promise((resolve, reject) => {
    child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => reject(new AppError('tts_unavailable', `음성 합성기를 실행할 수 없음: ${e.message}`)));
    child.on('close', (code, signal) => {
      if (child.killedByUs) return resolve({ out, killed: true });
      if (code === 0) return resolve({ out, killed: false });
      reject(new AppError('tts_failed', `음성 합성 실패(${code ?? signal}): ${err.trim().slice(0, 200)}`));
    });
    child.stdin.on('error', () => { /* 끊긴 뒤 쓰기 오류는 무시 */ });
    child.stdin.end(input, 'utf8');
  });
  return {
    done,
    kill() {
      if (child && child.exitCode === null) {
        child.killedByUs = true;
        child.kill();
      }
    },
  };
}

export function createSystemSpeaker({ platform = process.platform, voice } = {}) {
  if (platform === 'win32') {
    const ps = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_SCRIPT];
    const env = (out) => ({ JARVIS_TTS_VOICE: voice ?? '', JARVIS_TTS_OUT: out ?? '' });
    return {
      platform,
      speak: (text) => run('powershell.exe', ps, { input: text, env: env() }),
      // 파일로 만들기(소리 없음). 끊을 수 있는 핸들을 돌려준다.
      synthesize: (text, path) => run('powershell.exe', ps, { input: text, env: env(path) }),
      synthesizeToFile: (text, path) => run('powershell.exe', ps, { input: text, env: env(path) }).done,
      async listVoices() {
        const { out } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_VOICES]).done;
        return out.split(/\r?\n/).filter(Boolean).map((l) => {
          const [name, culture] = l.split('|');
          return { name, culture };
        });
      },
    };
  }
  if (platform === 'darwin') {
    // macOS 미검증: say -f - 는 표준 입력을 읽는다. 한국어 음성 예: Yuna.
    const base = (out) => [...(voice ? ['-v', voice] : []), ...(out ? ['-o', out, '--data-format=LEI16@22050'] : []), '-f', '-'];
    return {
      platform,
      speak: (text) => run('say', base(), { input: text }),
      synthesize: (text, path) => run('say', base(path), { input: text }),
      synthesizeToFile: (text, path) => run('say', base(path), { input: text }).done,
      async listVoices() {
        const { out } = await run('say', ['-v', '?']).done;
        return out.split('\n').filter(Boolean).map((l) => {
          const m = l.match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s/);
          return m ? { name: m[1].trim(), culture: m[2].replace('_', '-') } : null;
        }).filter(Boolean);
      },
    };
  }
  throw new AppError('tts_unavailable', `이 OS(${platform})의 음성 합성은 아직 지원하지 않음`);
}
