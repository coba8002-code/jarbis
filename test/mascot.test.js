// 오리지널 캐릭터 자비: 고르면 그림 얼굴 5장이 들어가고, 이미 그림이 있으면 덮지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createServices } from '../src/app/services.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { CHARACTER_PRESETS, MASCOT_DIR, adoptPreset, applyMascot } from '../src/character/presets.js';
import { IMAGE_STATES, sniffImage } from '../src/character/avatar-images.js';
import { tempDbPath } from './helpers.js';

test('그림이 있는 오리지널 친구(자비 + 동물 친구 10마리): 친구마다 5장, 투명 PNG, 한 장 5MB 이하', () => {
  const withArt = CHARACTER_PRESETS.filter((p) => p.mascot);
  assert.equal(withArt.length, 11);
  assert.ok(withArt.every((p) => p.group === '오리지널'));
  for (const p of withArt) for (const s of IMAGE_STATES) {
    const f = `${MASCOT_DIR}${p.key}/${s}.png`;
    assert.ok(existsSync(f), s);
    const buf = readFileSync(f);
    assert.ok(buf.length < 5 * 1024 * 1024);
    assert.equal(sniffImage(buf), 'png');
  }
  assert.equal(CHARACTER_PRESETS[0].key, 'jabi');
});

test('자비를 고르면 그림 얼굴이 들어가고, 다시 골라도 바꾼 그림은 덮지 않는다', (t) => {
  const s = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  t.after(() => s.close());
  const r = adoptPreset(s.characters, 'jabi');
  assert.equal(r.mascot, true);
  assert.equal(applyMascot(s.avatarImages, r.character.id, IMAGE_STATES), 5);
  assert.deepEqual(s.avatarImages.list(r.character.id).map((x) => x.state), IMAGE_STATES);
  assert.equal(applyMascot(s.avatarImages, r.character.id, IMAGE_STATES), 0);
  assert.equal(adoptPreset(s.characters, 'chiikawa').mascot, false);
  const kiwi = adoptPreset(s.characters, 'kapi');
  assert.equal(applyMascot(s.avatarImages, kiwi.character.id, IMAGE_STATES, kiwi.key), 5);
  assert.equal(applyMascot(s.avatarImages, kiwi.character.id, IMAGE_STATES, '../x'), 0);
});
