// 옆 PC 마무리 스크립트(scripts/post-update.mjs): 시작프로그램 다리 설정에서 adb 경로·기기 번호 읽기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bridgeConfig } from '../scripts/post-update.mjs';

test('다리 .cmd에서 -Adb·-Serial·-Port를 읽는다(따옴표 있거나 없거나)', () => {
  const line = String.raw`powershell -NoProfile -File "C:\Users\coba8\jarvis-hybrid\scripts\tossfront-bridge.ps1" -Adb "C:\Users\coba8\platform-tools\adb.exe" -Serial 1a2b3c4d -Port 4780`;
  assert.deepEqual(bridgeConfig(line), { adb: String.raw`C:\Users\coba8\platform-tools\adb.exe`, serial: '1a2b3c4d', port: 4780 });
  assert.deepEqual(bridgeConfig(String.raw`... -Adb C:\pt\adb.exe`), { adb: String.raw`C:\pt\adb.exe`, serial: null, port: null });
  assert.deepEqual(bridgeConfig('nothing here'), { adb: null, serial: null, port: null });
});
