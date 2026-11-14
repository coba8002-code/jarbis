// 보안 연결(HTTPS)용 자체 서명 인증서. Windows·macOS 공통.
// 와이파이로 연 화면(http://192.168.x.x)은 보안 연결이 아니어서 브라우저가 마이크·카메라를 막는다(2026-11-14 실제 확인).
// --https로 켜면 데이터 폴더(tls/)에 이 PC 전용 인증서를 한 번 만들어 쓴다. 키는 그 폴더에만 두고 어디에도 보내지 않는다.
// 처음 접속하는 기기에서는 "안전하지 않음" 경고가 한 번 나오며, 사용자가 지문을 확인하고 계속하면 된다.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { AppError } from '../errors.js';

const DAY = 24 * 60 * 60 * 1000;

// 인증서가 이 주소를 담고 있고 하루 넘게 남았으면 그대로 쓴다.
function usable(certPem, host) {
  try {
    const x = new X509Certificate(certPem);
    const covers = !host || (isIP(host) ? x.checkIP(host) : x.checkHost(host));
    return Boolean(covers) && new Date(x.validTo).getTime() > Date.now() + DAY;
  } catch {
    return false;
  }
}

// host: 다른 기기가 접속할 주소(예: 192.168.0.53). 127.0.0.1·localhost는 늘 넣는다.
// 돌려주는 값: { key, cert, created, fingerprint }. openssl이 없으면 tls_unavailable.
export function ensureTls(dataDir, host, { openssl = process.env.JARVIS_OPENSSL ?? 'openssl' } = {}) {
  const dir = join(dataDir, 'tls');
  const keyFile = join(dir, 'key.pem');
  const certFile = join(dir, 'cert.pem');
  if (existsSync(keyFile) && existsSync(certFile)) {
    const cert = readFileSync(certFile);
    if (usable(cert, host)) return { key: readFileSync(keyFile), cert, created: false, fingerprint: new X509Certificate(cert).fingerprint256 };
  }
  mkdirSync(dir, { recursive: true });
  const names = ['IP:127.0.0.1', 'DNS:localhost'];
  if (host && host !== '127.0.0.1' && host !== 'localhost') names.push(isIP(host) ? `IP:${host}` : `DNS:${host}`);
  const r = spawnSync(openssl, [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825',
    '-keyout', keyFile, '-out', certFile, '-subj', '/CN=JARVIS local', '-addext', `subjectAltName=${names.join(',')}`,
  ], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (r.error || r.status !== 0) {
    const why = (r.error?.message ?? r.stderr ?? '').trim().split('\n')[0].slice(0, 160);
    throw new AppError('tls_unavailable', `보안 연결 인증서를 만들지 못함(openssl 필요, JARVIS_OPENSSL로 경로 지정 가능): ${why}`);
  }
  const cert = readFileSync(certFile);
  return { key: readFileSync(keyFile), cert, created: true, fingerprint: new X509Certificate(cert).fingerprint256 };
}
