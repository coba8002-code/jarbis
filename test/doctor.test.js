// PC 점검 검사. 가짜 fetch·실행기만 쓴다(Ollama·ffmpeg를 실제로 부르지 않음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { runDoctor, formatDoctor } from '../src/app/doctor.js';

const ffOk = () => ({ status: 0, stdout: 'ffmpeg version 9\n' });
const ffNo = () => ({ error: new Error('ENOENT') });
const tags = (names) => async () => ({ ok: true, json: async () => ({ models: names.map((name) => ({ name })) }) });

test('모두 정상', async () => {
  const r = await runDoctor({ env: { JARVIS_OLLAMA_MODEL: 'gemma4:12b' }, dataDir: tmpdir(), whisper: { server: process.execPath, model: process.execPath }, fetchImpl: tags(['gemma4:12b']), runImpl: ffOk });
  assert.equal(r.summary.fail, 0);
  assert.equal(r.summary.warn, 0);
  assert.match(formatDoctor(r), /정상 \d+ · 주의 0 · 실패 0/);
});

test('모델 없음은 주의 + 받는 명령 안내(직접 실행), Ollama 꺼짐·파일 없음은 실패 + 고치는 방법', async () => {
  const r = await runDoctor({ env: { JARVIS_OLLAMA_MODEL: 'gemma4:12b' }, whisper: { server: 'C:/없는/whisper-server.exe', model: 'C:/없는/model.bin' }, fetchImpl: tags(['other:1b']), runImpl: ffNo });
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by.ollama.state, 'warn');
  assert.match(by.ollama.hint, /ollama pull gemma4:12b/);
  assert.equal(by.whisper.state, 'fail');
  assert.equal(by.ffmpeg.state, 'warn');
  const off = await runDoctor({ env: {}, fetchImpl: async () => { throw Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } }); }, runImpl: ffOk });
  assert.equal(off.checks.find((c) => c.id === 'ollama').state, 'fail');
  assert.match(off.checks.find((c) => c.id === 'ollama').detail, /ECONNREFUSED/);
});
