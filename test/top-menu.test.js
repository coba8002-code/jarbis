// 메인 화면 설정 모음 창(top-menu.js) 규칙 검사. 화면 동작은 헤드리스 Edge로 따로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROXIED, stateText } from '../src/server/public/top-menu.js';

test('설정 창으로 옮기는 버튼: 부르면 대답하기 · 카메라로 깨우기 · 장치 점검, 스피커는 위쪽 막대에 남김', () => {
  assert.deepEqual(PROXIED.map((p) => p.id), ['ambient', 'presence', 'tab-check']);
  assert.ok(!PROXIED.some((p) => p.id === 'voice'));
  const html = readFileSync(new URL('../src/server/public/jarvis.html', import.meta.url), 'utf8');
  for (const p of PROXIED) assert.match(html, new RegExp(`id="${p.id}"`), p.id);
  assert.match(html, /id="to-settings"/);
  assert.match(html, /b\.hidden = false; \/\/ 기기 음성이 없어도 PC 음성/);
  assert.equal(stateText(true), '켜짐');
  assert.equal(stateText(false), '꺼짐');
});

test('회의봇·스트림덱은 캐릭터 위, 바로 가기 줄은 단축키만', () => {
  const deck = readFileSync(new URL('../src/server/public/deck.js', import.meta.url), 'utf8');
  assert.match(deck, /scene\.before\(heroActs\)/);
  assert.match(deck, /id: 'hero-meet'/);
  assert.match(deck, /id: 'hero-pad'/);
  assert.doesNotMatch(deck, /id: 'dock-ai'|id: 'dock-pad'|dock-meet', 'data-meet'/);
  assert.match(deck, /mountTopMenu\(/);
});
