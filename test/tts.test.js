// PC 음성 대체(/api/tts): 기기에 음성 엔진이 없을 때 PC가 WAV를 만들어 준다(2026-11-15, 토스 기기).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { tempDbPath } from './helpers.js';

const FAKE_WAV = Buffer.from('RIFF....WAVEfmt fake');

async function start(t, speakerFactory) {
  const providers = new ProviderRegistry({ mock: createMockProvider('mock', { chunks: ['답'] }) });
  const services = createServices({ dataDir: dirname(tempDbPath()), providers, speakerFactory });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  const call = (body, { token = app.token, raw } = {}) => new Promise((resolve, reject) => {
    const data = raw ?? JSON.stringify(body);
    const headers = { 'content-type': 'application/json' };
    if (token) headers['x-jarvis-token'] = token;
    const rq = httpRequest({ host: '127.0.0.1', port, path: '/api/tts', method: 'POST', headers }, (rs) => {
      const chunks = [];
      rs.on('data', (c) => chunks.push(c));
      rs.on('end', () => resolve({ status: rs.statusCode, headers: rs.headers, body: Buffer.concat(chunks) }));
    });
    rq.on('error', reject);
    rq.end(data);
  });
  return { call };
}

function fakeFactory(log) {
  return (voice) => ({
    speak: () => ({ done: Promise.resolve({}), kill() {} }),
    async synthesizeToFile(text, path) { log.push({ voice, text, path }); writeFileSync(path, FAKE_WAV); },
  });
}

test('/api/tts: 글을 PC 음성 WAV로 돌려주고 임시 파일은 남기지 않는다', async (t) => {
  const log = [];
  const { call } = await start(t, fakeFactory(log));
  const r = await call({ text: '  안녕하세요  ' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'audio/wav');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.deepEqual(r.body, FAKE_WAV);
  assert.equal(log.length, 1);
  assert.equal(log[0].text, '안녕하세요');
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(log[0].path), false);
});

test('/api/tts: 토큰 없으면 403, 빈 글·너무 긴 글은 400', async (t) => {
  const log = [];
  const { call } = await start(t, fakeFactory(log));
  assert.equal((await call({ text: '안녕' }, { token: null })).status, 403);
  assert.equal((await call({ text: '   ' })).status, 400);
  assert.equal((await call({})).status, 400);
  assert.equal((await call({ text: 'ㄱ'.repeat(2001) })).status, 400);
  assert.equal(log.length, 0);
});

test('/api/tts: 파일을 만들 수 없는 스피커면 503', async (t) => {
  const { call } = await start(t, () => ({ speak: () => ({ done: Promise.resolve({}), kill() {} }) }));
  const r = await call({ text: '안녕' });
  assert.equal(r.status, 503);
  assert.equal(JSON.parse(r.body.toString()).error.code, 'tts_unavailable');
});
