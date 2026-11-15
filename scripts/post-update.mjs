#!/usr/bin/env node
// 새 코드를 넣은 뒤(apply-update.cmd 마지막 단계) 토스 기기 쪽 마무리(2026-11-15).
// 1) JARVIS 앱 새 판(apk)을 USB로 연결된 기기에 설치(adb install -r). 서명이 달라 안 되면 물어본 뒤에만 지우고 다시 설치.
// 2) 앱에 이 PC 서버를 "저장된 서버"로 넣고 연결(주소 https://127.0.0.1:<포트>, 지문은 이 PC 데이터 폴더의 인증서에서 계산).
// 3) 서버가 다시 뜨면 지금 고른 동물 친구를 다시 골라 새 그림(눈 깜빡임·입 다묾)을 채운다.
// adb 경로·기기 일련번호는 시작프로그램의 다리(.cmd) 설정에서 읽는다. 관리자 권한·방화벽·파티션은 건드리지 않는다.
// 사용: node scripts/post-update.mjs [--apk <apk 경로>] [--port 4780] [--data <데이터 폴더>] [--adb <adb.exe>] [--serial <기기>] [--yes]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { X509Certificate } from 'node:crypto';
import { request } from 'node:https';
import { createInterface } from 'node:readline/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const port = Number(flag('port') ?? 4780);
const dataDir = flag('data') ?? join(ROOT, 'data');
const apk = flag('apk');
const yes = args.includes('--yes');
const PKG = 'com.jarvishybrid.app';
const say = (s) => console.log(s);

// 시작프로그램의 다리 .cmd에서 -Adb · -Serial 읽기
export function bridgeConfig(text) {
  const adb = text.match(/-Adb\s+(?:"([^"]+)"|(\S+))/i);
  const serial = text.match(/-Serial\s+(?:"([^"]+)"|(\S+))/i);
  const port = text.match(/-Port\s+(\d+)/i);
  return { adb: adb ? (adb[1] ?? adb[2]) : null, serial: serial ? (serial[1] ?? serial[2]) : null, port: port ? Number(port[1]) : null };
}
function findBridge() {
  const dir = join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.cmd')) continue;
    const t = readFileSync(join(dir, f), 'utf8');
    if (/tossfront-bridge/i.test(t)) return bridgeConfig(t);
  }
  return null;
}
function adbRun(adb, serial, a, { allowFail = false } = {}) {
  try {
    return execFileSync(adb, [...(serial ? ['-s', serial] : []), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
  } catch (e) {
    if (allowFail) return `${e.stdout ?? ''}${e.stderr ?? ''}` || `adb를 실행하지 못했어요(${e.code ?? e.message})`;
    throw new Error(`${a.slice(0, 2).join(' ')} 실패: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
}
function getHttps(path, fp, headers = {}, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    // 이 PC 서버(127.0.0.1)만. 인증서는 지문이 같을 때만 믿는다.
    const rq = request({ host: '127.0.0.1', port, path, method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, rejectUnauthorized: false, timeout: 15_000 }, (rs) => {
      const got = rs.socket.getPeerCertificate()?.fingerprint256;
      if (fp && got !== fp) { rs.destroy(); reject(new Error('서버 인증서 지문이 다름')); return; }
      let t = '';
      rs.setEncoding('utf8');
      rs.on('data', (c) => { t += c; });
      rs.on('end', () => resolve({ status: rs.statusCode, text: t }));
    });
    rq.on('error', reject);
    rq.on('timeout', () => rq.destroy(new Error('시간 초과')));
    if (body) rq.write(JSON.stringify(body));
    rq.end();
  });
}

async function main() {
  const certFile = join(dataDir, 'tls', 'cert.pem');
  const fp = existsSync(certFile) ? new X509Certificate(readFileSync(certFile)).fingerprint256 : null;
  say(fp ? `서버 인증서 지문: ${fp}` : '서버 인증서가 아직 없음(서버가 처음 켜질 때 만들어짐)');
  const b = findBridge();
  const adb = flag('adb') ?? b?.adb ?? 'adb';
  const serial = flag('serial') ?? b?.serial ?? null;
  say(`adb: ${adb}${serial ? ` · 기기 ${serial}` : ''}`);

  // 1) 앱 설치
  if (apk && existsSync(apk)) {
    say('[앱] 새 판 설치 중…');
    let out = adbRun(adb, serial, ['install', '-r', apk], { allowFail: true });
    if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i.test(out)) {
      say('[앱] 지금 깔린 앱과 서명이 달라 그대로 올릴 수 없어요. 지우고 다시 깔면 앱 설정(서버 주소)은 아래에서 다시 넣어요.');
      let ok = yes;
      if (!ok) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        ok = /^(y|yes|예|네|ㅇ)$/i.test((await rl.question('지우고 다시 설치할까요? (y/N) ')).trim());
        rl.close();
      }
      if (!ok) { say('[앱] 설치하지 않았어요. 서버 코드는 이미 새것이에요.'); }
      else {
        adbRun(adb, serial, ['uninstall', PKG], { allowFail: true });
        out = adbRun(adb, serial, ['install', apk], { allowFail: true });
      }
    }
    if (/Success/.test(out)) {
      say('[앱] 설치 완료');
      for (const perm of ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA']) adbRun(adb, serial, ['shell', 'pm', 'grant', PKG, perm], { allowFail: true });
      adbRun(adb, serial, ['shell', 'appops', 'set', PKG, 'SYSTEM_ALERT_WINDOW', 'allow'], { allowFail: true }); // 부팅 때 자동 열기(T317과 같음)
    } else if (out.trim()) say(`[앱] 설치 결과: ${out.trim().split('\n').at(-1)}`);
  } else say('[앱] 설치할 apk가 없어 앱은 건너뜀');

  // 2) 서버가 뜰 때까지 기다리기(최대 90초)
  let token = null;
  for (let i = 0; i < 45 && !token; i += 1) {
    try {
      const r = await getHttps('/jarvis', fp);
      token = r.text.match(/name="jarvis-token" content="([0-9a-f]+)"/)?.[1] ?? null;
    } catch { /* 아직 */ }
    if (!token) await new Promise((r) => setTimeout(r, 2000));
  }
  const certNow = existsSync(certFile) ? new X509Certificate(readFileSync(certFile)).fingerprint256 : null;
  if (!token) { say(`[서버] https://127.0.0.1:${port} 이 아직 응답하지 않아요. 다리가 켜졌는지 확인해 주세요.`); }
  else say(`[서버] 새 코드로 켜짐(https://127.0.0.1:${port})`);

  // 3) 앱에 저장된 서버로 넣고 연결
  if (certNow) {
    const r = adbRun(adb, serial, ['shell', 'am', 'broadcast', '-n', `${PKG}/.ConfigReceiver`, '--es', 'server', `https://127.0.0.1:${port}`, '--es', 'pin', certNow, '--es', 'name', '옆 PC'], { allowFail: true });
    say(/result=1/.test(r) ? '[앱] "옆 PC" 서버를 저장하고 다시 연결했어요' : `[앱] 연결 설정을 넣지 못했어요: ${r.trim().split('\n').at(-1) ?? ''}`);
  }

  // 4) 지금 고른 동물 친구 다시 고르기(빠진 그림 채우기)
  if (token) {
    try {
      const h = { 'x-jarvis-token': token };
      const presets = JSON.parse((await getHttps('/api/character-presets', certNow, h)).text);
      const now = Array.isArray(presets) ? presets.find((p) => p.active && p.mascot) : null;
      if (now) {
        const a = JSON.parse((await getHttps(`/api/character-presets/${now.key}/adopt`, certNow, h, 'POST', {})).text);
        say(`[친구] ${now.name} 다시 고름: 새 그림 ${a.imagesAdded ?? 0}장 추가`);
      } else say('[친구] 지금 고른 친구가 그림 있는 동물 친구가 아니라 건너뜀');
    } catch (e) { say(`[친구] 다시 고르지 못했어요: ${e.message}`); }
  }
  say('마무리 끝.');
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('post-update.mjs')) {
  main().catch((e) => { console.error(`마무리 실패: ${e.message}`); process.exitCode = 1; });
}
