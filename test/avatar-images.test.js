// 캐릭터 그림 얼굴(2026-11-14). 시험용 그림은 코드로 만든 아주 작은 바이트(실제 그림 아님)만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AvatarImages, sniffImage, MAX_IMAGE_BYTES } from '../src/character/avatar-images.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { tempDbPath } from './helpers.js';

const pad = (head, n = 32) => Buffer.concat([head, Buffer.alloc(n)]);
const PNG = pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const JPG = pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
const GIF = pad(Buffer.from('GIF89a', 'latin1'));
const WEBP = pad(Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1')]));

test('그림 형식은 파일 앞부분으로만 판단한다(PNG·JPEG·GIF·WebP)', () => {
  assert.equal(sniffImage(PNG), 'png');
  assert.equal(sniffImage(JPG), 'jpg');
  assert.equal(sniffImage(GIF), 'gif');
  assert.equal(sniffImage(WEBP), 'webp');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null, 'SVG(스크립트 가능)는 받지 않음');
  assert.equal(sniffImage(Buffer.from('not an image at all')), null);
});

test('저장·목록·읽기·바꾸기·지우기: 같은 상태에 다른 형식을 넣으면 옛 파일은 지운다', () => {
  const store = new AvatarImages(join(dirname(tempDbPath()), 'avatars'));
  assert.deepEqual(store.list(1), []);
  store.save(1, 'idle', PNG);
  store.save(1, 'speaking', GIF);
  assert.deepEqual(store.list(1).map((x) => x.state), ['idle', 'speaking']);
  assert.deepEqual(store.read(1, 'idle'), { buf: PNG, type: 'image/png' });
  store.save(1, 'idle', WEBP); // 형식이 바뀌면 옛 파일(idle.png)은 남지 않음
  assert.deepEqual(store.read(1, 'idle'), { buf: WEBP, type: 'image/webp' });
  assert.equal(existsSync(join(store.dir, '1', 'idle.png')), false);
  assert.equal(store.remove(1, 'speaking').removed, true);
  assert.deepEqual(store.list(1).map((x) => x.state), ['idle']);
  assert.throws(() => store.read(1, 'speaking'), { code: 'not_found' });
  store.removeAll(1);
  assert.deepEqual(store.list(1), []);
});

test('잘못된 상태·그림 아님·너무 큼·빈 그림·잘못된 번호는 거부한다', () => {
  const store = new AvatarImages(join(dirname(tempDbPath()), 'avatars'));
  assert.throws(() => store.save(1, 'angry', PNG), { code: 'invalid_input' });
  assert.throws(() => store.save(1, '../../evil', PNG), { code: 'invalid_input' });
  assert.throws(() => store.save(1, 'idle', Buffer.from('hello world, not an image')), { code: 'invalid_input' });
  assert.throws(() => store.save(1, 'idle', Buffer.alloc(0)), { code: 'invalid_input' });
  assert.throws(() => store.save(1, 'idle', Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)])), { code: 'payload_too_large' });
  assert.throws(() => store.save(0, 'idle', PNG), { code: 'invalid_input' });
  assert.deepEqual(store.list(1), []);
});

async function start(t) {
  const dataDir = dirname(tempDbPath());
  const services = createServices({ dataDir, providers: new ProviderRegistry({ mock: createMockProvider('mock') }) });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const call = (method, path, { body, type = 'application/json', token = app.token } = {}) => new Promise((resolve, reject) => {
    const headers = { 'content-type': type };
    if (token) headers['x-jarvis-token'] = token;
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers }, (rs) => {
      const chunks = [];
      rs.on('data', (c) => chunks.push(c));
      rs.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString('utf8')); } catch { /* 그림 */ }
        resolve({ status: rs.statusCode, json, buf, headers: rs.headers });
      });
    });
    rq.on('error', reject);
    if (body) rq.write(Buffer.isBuffer(body) ? body : JSON.stringify(body));
    rq.end();
  });
  return { services, call, dataDir };
}

test('화면 API: 그림 올리기(토큰 필요) → 목록·적용 상태에 보임 → 받기 → 지우기', async (t) => {
  const { call } = await start(t);
  const c = (await call('POST', '/api/characters', { body: { name: '시험 캐릭터', persona: '짧게 말함' } })).json;
  assert.equal((await call('POST', `/api/characters/${c.id}/image?state=idle`, { body: PNG, type: 'image/png', token: null })).status, 403, '토큰 없으면 거부');
  const up = await call('POST', `/api/characters/${c.id}/image?state=idle`, { body: PNG, type: 'image/png' });
  assert.equal(up.status, 200);
  assert.equal(up.json.type, 'image/png');
  await call('POST', `/api/characters/${c.id}/image?state=speaking`, { body: JPG, type: 'image/jpeg' });
  const list = (await call('GET', '/api/characters')).json.find((x) => x.id === c.id);
  assert.deepEqual(list.images.map((x) => x.state), ['idle', 'speaking']);
  await call('POST', `/api/characters/${c.id}/activate`);
  assert.deepEqual((await call('GET', '/api/voice')).json.character.images.map((x) => x.state), ['idle', 'speaking'], '자비스 모드가 쓰는 적용 상태에도 보임');
  const got = await call('GET', `/api/characters/${c.id}/image?state=idle`);
  assert.equal(got.status, 200);
  assert.equal(got.headers['content-type'], 'image/png');
  assert.equal(got.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(got.buf, PNG);
  assert.equal((await call('GET', `/api/characters/${c.id}/image?state=idle`, { token: null })).status, 403, '받기도 토큰 필요');
  assert.equal((await call('DELETE', `/api/characters/${c.id}/image?state=speaking`)).json.removed, true);
  assert.equal((await call('GET', `/api/characters/${c.id}/image?state=speaking`)).status, 404);
});

test('화면 API: 그림이 아니거나 형식이 틀리거나 없는 캐릭터면 거부, 캐릭터를 지우면 그림 폴더도 지운다', async (t) => {
  const { call, dataDir } = await start(t);
  const c = (await call('POST', '/api/characters', { body: { name: '시험', persona: '짧게' } })).json;
  assert.equal((await call('POST', `/api/characters/${c.id}/image?state=idle`, { body: Buffer.from('<svg></svg> not allowed'), type: 'image/svg+xml' })).status, 400);
  assert.equal((await call('POST', `/api/characters/${c.id}/image?state=idle`, { body: PNG, type: 'text/plain' })).status, 400);
  assert.equal((await call('POST', `/api/characters/${c.id}/image?state=happy`, { body: PNG, type: 'image/png' })).status, 400);
  assert.equal((await call('POST', '/api/characters/999/image?state=idle', { body: PNG, type: 'image/png' })).status, 404);
  await call('POST', `/api/characters/${c.id}/image?state=idle`, { body: PNG, type: 'image/png' });
  assert.equal(existsSync(join(dataDir, 'avatars', String(c.id))), true);
  await call('DELETE', `/api/characters/${c.id}`);
  assert.equal(existsSync(join(dataDir, 'avatars', String(c.id))), false);
});

test('두 화면 모두 그림을 브라우저 안(blob)에서만 보여 주도록 허용한다', async (t) => {
  const { call } = await start(t);
  for (const path of ['/', '/jarvis']) {
    const r = await call('GET', path, { token: null });
    assert.match(r.headers['content-security-policy'], /img-src 'self' blob:/, path);
  }
});
