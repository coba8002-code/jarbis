// 보안 연결(HTTPS) 옵션(T276). 와이파이로 연 화면에서 브라우저가 마이크·카메라를 허락하려면 보안 연결이 필요하다.
// openssl이 없는 기기에서는 인증서 검사를 건너뛴다(없을 때의 안내는 따로 확인).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { X509Certificate } from 'node:crypto';
import { dirname } from 'node:path';
import { ensureTls } from '../src/app/tls.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { tempDbPath } from './helpers.js';

const hasOpenssl = spawnSync(process.env.JARVIS_OPENSSL ?? 'openssl', ['version'], { windowsHide: true }).status === 0;

test('인증서: 처음에 만들고 다음에는 그대로 쓰며, 주소가 바뀌면 새로 만든다', { skip: !hasOpenssl && 'openssl 없음' }, () => {
  const dataDir = dirname(tempDbPath());
  const a = ensureTls(dataDir, '192.0.2.10');
  assert.equal(a.created, true);
  const x = new X509Certificate(a.cert);
  assert.ok(x.checkIP('192.0.2.10'), '와이파이 주소');
  assert.ok(x.checkIP('127.0.0.1'), '이 기기 주소');
  assert.ok(x.checkHost('localhost'));
  const b = ensureTls(dataDir, '192.0.2.10');
  assert.equal(b.created, false, '같은 주소면 다시 만들지 않음');
  assert.equal(b.fingerprint, a.fingerprint);
  const c = ensureTls(dataDir, '192.0.2.99');
  assert.equal(c.created, true, '인증서에 없는 주소면 새로 만듦');
  assert.ok(new X509Certificate(c.cert).checkIP('192.0.2.99'));
});

test('보안 연결 서버: 자비스 모드를 HTTPS로 내보내고, 일반 HTTP 요청은 받지 않는다', { skip: !hasOpenssl && 'openssl 없음' }, async (t) => {
  const dataDir = dirname(tempDbPath());
  const tls = ensureTls(dataDir, '127.0.0.1');
  const services = createServices({ dataDir, providers: new ProviderRegistry({ mock: createMockProvider('mock') }) });
  const app = createAppServer(services, { tls });
  const { port, url, secure } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  assert.equal(secure, true);
  assert.equal(url, `https://127.0.0.1:${port}/`);
  // 이 인증서를 믿는 클라이언트는 정상 연결(이름 확인 포함)
  const status = await new Promise((resolve, reject) => {
    const rq = httpsRequest({ host: '127.0.0.1', port, path: '/jarvis', method: 'GET', ca: tls.cert }, (rs) => { rs.resume(); rs.on('end', () => resolve(rs.statusCode)); });
    rq.on('error', reject); rq.end();
  });
  assert.equal(status, 200);
  // 인증서를 모르는 클라이언트는 연결을 믿지 않는다(자체 서명)
  await assert.rejects(new Promise((resolve, reject) => {
    const rq = httpsRequest({ host: '127.0.0.1', port, path: '/jarvis', method: 'GET' }, (rs) => { rs.resume(); rs.on('end', resolve); });
    rq.on('error', reject); rq.end();
  }));
  // 일반 HTTP로는 화면을 받지 못한다
  await assert.rejects(new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path: '/jarvis', method: 'GET', timeout: 3000 }, (rs) => { rs.resume(); rs.on('end', () => (rs.statusCode === 200 ? resolve() : reject(new Error(String(rs.statusCode))))); });
    rq.on('timeout', () => rq.destroy(new Error('timeout'))); rq.on('error', reject); rq.end();
  }));
});

test('openssl이 없으면 이유와 방법을 알려 주는 오류를 낸다', () => {
  const dataDir = dirname(tempDbPath());
  assert.throws(() => ensureTls(dataDir, '192.0.2.10', { openssl: 'jarvis-no-such-openssl' }), (e) => e.code === 'tls_unavailable' && /openssl 필요/.test(e.message));
});
