// 고를 수 있는 캐릭터(치이카와·산리오, 2026-11-14). 이름·말투 설명·도형 얼굴만 있고 그림은 없다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { dirname } from 'node:path';
import { CHARACTER_PRESETS, PRESET_GROUPS, listPresets, adoptPreset } from '../src/character/presets.js';
import { createServices } from '../src/app/services.js';
import { createAppServer } from '../src/server/server.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { createMockProvider } from '../src/providers/mock.js';
import { tempDbPath } from './helpers.js';

function services(t) {
  const s = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ mock: createMockProvider('mock') }) });
  t.after(() => s.close());
  return s;
}

test('목록: 치이카와·산리오 두 묶음, 키·이름이 겹치지 않고 모두 그대로 저장할 수 있다', (t) => {
  const s = services(t);
  assert.deepEqual([...new Set(CHARACTER_PRESETS.map((p) => p.group))], [...PRESET_GROUPS]);
  assert.equal(new Set(CHARACTER_PRESETS.map((p) => p.key)).size, CHARACTER_PRESETS.length);
  assert.equal(new Set(CHARACTER_PRESETS.map((p) => p.name)).size, CHARACTER_PRESETS.length);
  for (const p of CHARACTER_PRESETS) {
    const c = s.characters.create({ name: p.name, persona: p.persona, look: p.look }); // 저장 규칙(길이·얼굴·비밀 검사)을 통과
    assert.equal(c.look.color, p.look.color);
    assert.match(c.persona, /지어내지 않는다/);
  }
});

test('고르기: 처음이면 만들어 적용하고, 같은 이름이 있으면 새로 만들지 않고 그 캐릭터(고친 말투 유지)를 적용한다', (t) => {
  const s = services(t);
  const first = adoptPreset(s.characters, 'chiikawa');
  assert.equal(first.created, true);
  assert.equal(s.characters.active().name, '치이카와');
  s.characters.update(first.character.id, { persona: '내가 고친 말투' });
  adoptPreset(s.characters, 'kuromi');
  assert.equal(s.characters.active().name, '쿠로미');
  const again = adoptPreset(s.characters, 'chiikawa');
  assert.equal(again.created, false);
  assert.equal(again.character.id, first.character.id);
  assert.equal(again.character.persona, '내가 고친 말투');
  assert.equal(s.characters.list().length, 2);
  const listed = listPresets(s.characters);
  assert.equal(listed.find((p) => p.key === 'chiikawa').have, first.character.id);
  assert.equal(listed.find((p) => p.key === 'chiikawa').active, true);
  assert.equal(listed.find((p) => p.key === 'hellokitty').have, null);
  assert.throws(() => adoptPreset(s.characters, 'nobody'), { code: 'not_found' });
});

test('화면 API: 목록·고르기는 토큰이 있어야 하고, 고른 캐릭터가 자비스 모드 상태에 바로 보인다', async (t) => {
  const s = services(t);
  const app = createAppServer(s);
  const { port } = await app.listen(0);
  t.after(() => app.close());
  const call = (method, path, token = app.token) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers['x-jarvis-token'] = token;
    const rq = httpRequest({ host: '127.0.0.1', port, path, method, headers }, (rs) => {
      let body = '';
      rs.on('data', (c) => { body += c; });
      rs.on('end', () => resolve({ status: rs.statusCode, json: JSON.parse(body) }));
    });
    rq.on('error', reject);
    rq.end();
  });
  assert.equal((await call('GET', '/api/character-presets', null)).status, 403);
  const list = await call('GET', '/api/character-presets');
  assert.equal(list.status, 200);
  assert.equal(list.json.length, CHARACTER_PRESETS.length);
  assert.equal((await call('POST', '/api/character-presets/cinnamoroll/adopt', null)).status, 403);
  const r = await call('POST', '/api/character-presets/cinnamoroll/adopt');
  assert.equal(r.status, 200);
  assert.equal(r.json.character.name, '시나모롤');
  assert.equal((await call('GET', '/api/voice')).json.character.name, '시나모롤');
  assert.equal((await call('POST', '/api/character-presets/nobody/adopt')).status, 404);
});
