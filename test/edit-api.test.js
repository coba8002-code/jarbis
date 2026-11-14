// 화면의 "수정 저장"이 보내는 요청 형태 검사(기억 태그, 캐릭터 전체 수정). 가짜 스피커·공급자만 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

async function start(t) {
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  const app = createAppServer(services);
  const { port } = await app.listen(0);
  t.after(async () => { await app.close(); services.close(); });
  return (method, path, body) => new Promise((resolve, reject) => {
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'x-jarvis-token': app.token, 'content-type': 'application/json' } }, (rs) => {
      let text = ''; rs.on('data', (c) => { text += c; }); rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(text) }));
    });
    rq.on('error', reject);
    rq.end(body ? JSON.stringify(body) : undefined);
  });
}

test('기억 수정: 내용과 태그를 함께 바꾸고, 빈 목록이면 태그를 모두 지움', async (t) => {
  const call = await start(t);
  const m = (await call('POST', '/api/memories', { content: '커피', tags: ['취향'] })).json;
  const u = (await call('PUT', `/api/memories/${m.id}`, { content: '차', tags: ['취향', '음료', '아침'] })).json;
  assert.deepEqual([u.content, u.tags], ['차', ['취향', '음료', '아침']]);
  assert.equal((await call('GET', `/api/memories?q=${encodeURIComponent('아침')}`)).json.length, 1);
  assert.deepEqual((await call('PUT', `/api/memories/${m.id}`, { content: '차', tags: [] })).json.tags, []);
  assert.equal((await call('PUT', `/api/memories/${m.id}`, { content: '차', tags: 'x' })).status, 400);
});

test('캐릭터 전체 수정: 이용 조건 빠진 자산이면 거부하고 그대로 둠, 고치면 저장·적용 유지', async (t) => {
  const call = await start(t);
  const c = (await call('POST', '/api/characters', { name: '자비', persona: '차분함', voice: 'V1', assets: [{ name: '그림', source: '직접', license: '개인' }] })).json;
  await call('POST', `/api/characters/${c.id}/activate`);
  const bad = await call('PUT', `/api/characters/${c.id}`, { name: '자비', persona: '밝음', voice: 'V1', assets: [{ name: '그림', source: '직접', license: '개인' }, { name: '음악', source: '녹음', license: '' }] });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error.message, /자산 2 이용 조건/);
  assert.equal((await call('GET', '/api/characters')).json[0].persona, '차분함');
  const ok = (await call('PUT', `/api/characters/${c.id}`, { name: '자비2', persona: '밝음', voice: null, assets: [{ name: '음악', source: '녹음', license: '개인' }] })).json;
  assert.deepEqual([ok.name, ok.persona, ok.voice, ok.assets.length], ['자비2', '밝음', null, 1]);
  assert.equal((await call('GET', '/api/characters')).json[0].active, true);
});
