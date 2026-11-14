// 비밀 값 가리기·기억 제안 검사. 실제 모델 없음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { redactSecrets } from '../src/security/redact.js';
import { MemorySuggester, parseFacts, buildExtractRequest } from '../src/memory/suggest.js';
import { createServices } from '../src/app/services.js';
import { ProviderRegistry } from '../src/providers/registry.js';
import { tempDbPath } from './helpers.js';

test('비밀 값 가리기: 키·토큰·이메일·카드·비밀번호·인증 번호, 보통 글은 그대로', () => {
  const r = redactSecrets('내 키는 sk-proj-abcdefghijklmnopqrstuvwx 이고 메일은 me@example.com, 비밀번호: hunter22, 카드 1234 5678 9012 3456, 인증번호 123456');
  assert.doesNotMatch(r.text, /abcdefghijklmnop|me@example\.com|hunter22|9012|123456/);
  assert.match(r.text, /\[가림:OpenAI 키\]/);
  assert.ok(r.count >= 5);
  assert.equal(redactSecrets('내일 3시에 서울역에서 만나').text, '내일 3시에 서울역에서 만나');
  assert.equal(redactSecrets('Authorization: Bearer abcdefghijklmnop1234').text, 'Authorization: Bearer [가림]');
  assert.equal(redactSecrets('https://user:pw123@host.example/x').text.includes('pw123'), false);
});

test('사실 뽑기 요청은 비밀을 가리고, 답은 JSON의 짧은 문장만', () => {
  const req = buildExtractRequest([{ question: '내 비밀번호: abc12345 기억해', answer: '알겠어요' }], ['사용자는 커피를 좋아한다']);
  assert.doesNotMatch(req.messages[1].content, /abc12345/);
  assert.match(req.messages[1].content, /사용자는 커피를 좋아한다/);
  assert.deepEqual(parseFacts('{"facts": ["사용자는 매운 음식을 못 먹는다", 3, "", "sk-proj-abcdefghijklmnopqrstuvwx"]}'), ['사용자는 매운 음식을 못 먹는다']);
  assert.deepEqual(parseFacts('잘 모르겠어요'), []);
});

function fakeModel(facts) {
  const got = [];
  return { got, collect: async (name, req) => { got.push(req); return { text: JSON.stringify({ facts }) }; } };
}

test('기억 제안: 대화가 5분 멈춰야 뽑고, 이미 아는 것은 빼고, 고른 것만 저장', async (t) => {
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({}), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  t.after(() => services.close());
  services.memory.add('사용자는 커피를 좋아한다');
  let now = 0;
  const model = fakeModel(['사용자는 커피를 좋아한다', '사용자의 딸 이름은 서연이다', '사용자는 매운 음식을 못 먹는다']);
  const sg = new MemorySuggester({ memory: services.memory, providers: model, localProvider: () => 'ollama', now: () => now });
  sg.record({ question: '우리 딸 서연이가 매운 걸 좋아해. 난 매운 거 못 먹어', answer: '그렇군요' });
  now = 60_000;
  assert.equal(await sg.tick(), null); // 아직 5분 안 됨
  now = 6 * 60_000;
  const added = await sg.tick();
  assert.deepEqual(added.map((s) => s.content), ['사용자의 딸 이름은 서연이다', '사용자는 매운 음식을 못 먹는다']);
  assert.equal(services.memory.list().length, 1); // 아직 저장 안 함
  const saved = sg.accept(added[0].id);
  assert.equal(saved.content, '사용자의 딸 이름은 서연이다');
  assert.deepEqual(saved.tags, ['제안']);
  sg.dismiss(added[1].id);
  assert.equal(sg.list().length, 0);
  assert.throws(() => sg.accept(99), { code: 'not_found' });
  // 이 기기 안 모델이 없으면 뽑지 않음
  const none = new MemorySuggester({ memory: services.memory, providers: model, localProvider: () => null, now: () => 999_999_999 });
  none.record({ question: 'a', answer: 'b' });
  assert.equal(await none.tick(), null);
});

test('대화하면 기억 제안 쪽에 기록되고, 외부 공급자로 갈 때는 질문 속 비밀을 가린다', async (t) => {
  const got = [];
  const far = { name: 'far', describe: () => ({ name: 'far', baseUrl: 'https://far.invalid', model: 'm', remote: true }), async *stream(req) { got.push(req); yield { type: 'delta', text: '네' }; yield { type: 'done', finishReason: 'stop' }; } };
  const services = createServices({ dataDir: dirname(tempDbPath()), providers: new ProviderRegistry({ far }), speaker: { speak: () => ({ done: Promise.resolve(), kill() {} }) } });
  t.after(() => services.close());
  const r = await services.chat.ask({ provider: 'far', question: '이 키 sk-proj-abcdefghijklmnopqrstuvwx 맞아?' });
  assert.equal(r.redacted, 1);
  assert.doesNotMatch(got[0].messages.at(-1).content, /abcdefghijklmnop/);
  assert.equal(services.memorySuggest.exchanges.length, 1);
});

test('비밀 값 가리기: 보통 말은 가리지 않음("암호 화폐", "session 3")', () => {
  for (const t of ['비밀번호를 잊어버렸어', '암호 화폐 시세 알려 줘', 'session 3 시작', '토큰 이야기 해 줘']) assert.equal(redactSecrets(t).text, t);
  assert.equal(redactSecrets('비밀번호는 qwer1234!').text, '비밀번호는 [가림]');
});
