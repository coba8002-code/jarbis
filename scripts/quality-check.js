// 생각함·빠른 답·자동(계산·추론만 생각함)의 답 정확도와 시간 비교. Windows·macOS 공통, 수동 실행.
// 사용: node scripts/quality-check.js --model gemma4:12b [--rounds 2] [--set easy|hard|holdout|casual|casual2]
// - easy·hard: 규칙을 만들 때 참고한 문제, holdout·casual2: 규칙을 만들 때 쓰지 않은 새 문제.
// - casual·casual2는 정답이 없어 시간과 "자동이 생각함으로 보낸 비율"만 본다.
// - 이 기기 Ollama(루프백)만, 외부 전송 없음.
import { ProviderRegistry } from '../src/providers/registry.js';
import { isLoopback } from '../src/providers/http.js';
import { needsThinking } from '../src/conversation/reasoning.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const model = flag('model', process.env.JARVIS_OLLAMA_MODEL);
const rounds = Number(flag('rounds', 2));
const setName = flag('set', args.includes('--hard') ? 'hard' : 'easy');
const baseUrl = process.env.JARVIS_OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
if (!model) { console.error('--model 필요'); process.exit(2); }
if (!isLoopback(baseUrl)) { console.error('이 기기 Ollama만 씀'); process.exit(2); }

const SETS = {
  easy: [
    ['17 곱하기 23은?', /391/],
    ['사과가 5개 있었는데 2개를 먹고 3개를 더 샀어. 지금 몇 개야?', /(^|\D)6(\D|$)|여섯/],
    ['대한민국의 수도는?', /서울/],
    ['2의 10제곱은?', /1024|1,024/],
    ['1년 중 31일까지 있는 달은 몇 개야?', /(^|\D)7(\D|$)|일곱/],
    ['철수는 영희보다 키가 크고, 영희는 민수보다 키가 커. 가장 키가 작은 사람은?', /민수/],
    ['오늘이 월요일이면 10일 뒤는 무슨 요일이야?', /목요일/],
    ['시속 60km로 2시간 30분 동안 가면 몇 km를 가?', /150/],
    ['2, 6, 12, 20, 30 다음 수는?', /42/],
    ['어떤 수에 3을 곱하고 5를 더했더니 26이 됐어. 그 수는?', /(^|\D)7(\D|$)|일곱/],
  ],
  hard: [
    ['A는 B보다 3살 많고, B는 C 나이의 두 배야. C가 7살이면 A는 몇 살이야?', /17/],
    ['1부터 100까지 모두 더하면?', /5050|5,050/],
    ['시계가 3시 15분일 때 시침과 분침 사이 각도는 몇 도야?', /7\.5/],
    ['어떤 일을 A 혼자 하면 6시간, B 혼자 하면 3시간 걸려. 둘이 같이 하면 몇 시간 걸려?', /(^|\D)2(\D|$)|두 시간/],
    ['배트와 공이 합쳐서 1100원이고 배트가 공보다 1000원 비싸. 공은 얼마야?', /(^|\D)50(\D|$)|50원/],
    ['연못의 연잎이 매일 두 배로 늘어서 48일째에 연못을 다 덮어. 절반을 덮는 날은 며칠째야?', /47/],
    ['기계 5대가 5분에 물건 5개를 만들어. 기계 100대가 물건 100개를 만드는 데 몇 분 걸려?', /(^|\D)5(\D|$)|5분/],
    ['세 사람이 서로 한 번씩 악수하면 악수는 모두 몇 번이야?', /(^|\D)3(\D|$)|세 번/],
    ['9.11과 9.9 중 더 큰 수는?', /9\.9(?!\d)/],
    ['어떤 수를 4로 나누면 몫이 7이고 나머지가 3이야. 그 수는?', /31/],
  ],
  holdout: [
    ['12의 15%는?', /1\.8/],
    ['사탕 24개를 6명이 똑같이 나누면 한 사람에 몇 개야?', /(^|\D)4(\D|$)|네 개/],
    ['어떤 수에서 8을 빼고 2를 곱했더니 18이야. 그 수는?', /17/],
    ['직사각형의 가로가 7, 세로가 4면 넓이는?', /28/],
    ['3000원짜리 물건을 20% 할인하면 얼마야?', /2400|2,400/],
    ['한 변이 5인 정사각형의 둘레는?', /20/],
    ['1시간에 4km 걷는 사람이 3시간 반 걸으면 몇 km야?', /14/],
    ['7, 14, 28, 56 다음 수는?', /112/],
    ['닭과 토끼가 모두 10마리이고 다리가 28개야. 토끼는 몇 마리야?', /(^|\D)4(\D|$)|네 마리/],
    ['1/2 더하기 1/3은?', /5\/6|6분의 5/],
  ],
  casual: [
    ['안녕', null], ['자비스 오늘 날씨 어때?', null], ['음악 좀 틀어 줘', null], ['고마워 자비스', null], ['점심 메뉴 추천해 줘', null],
  ],
  casual2: [
    ['오늘 저녁 뭐 먹을까?', null], ['주말에 볼 영화 추천해 줘', null], ['잘 자', null], ['너는 누구야?', null], ['스트레스 푸는 방법 알려 줘', null],
    ['내일 일정 알려 줘', null], ['좋은 아침이야', null], ['한국어로 시 한 줄 써 줘', null], ['조용히 해 줘', null], ['오늘 하루 어땠어?', null],
  ],
};
const items = SETS[setName];
if (!items) { console.error(`--set은 ${Object.keys(SETS).join(', ')} 중 하나`); process.exit(2); }

const providers = ProviderRegistry.fromEnv({ env: { JARVIS_OLLAMA_BASE_URL: baseUrl, JARVIS_OLLAMA_MODEL: model } });
const system = '질문에 짧게 답해. 마지막 줄에 정답만 적어.';
async function ask(question, think) {
  const t0 = performance.now();
  const out = await providers.collect('ollama', { messages: [{ role: 'system', content: system }, { role: 'user', content: question }], think });
  return { ms: Math.round(performance.now() - t0), text: out.text.trim() };
}

await ask('안녕', false); // 모델 불러오기(시간 측정에서 뺌)
const modes = [['생각함', () => true], ['빠른 답', () => false], ['자동', (q) => needsThinking(q).think]];
const result = {};
for (const [mode, pick] of modes) {
  const rows = [];
  for (let r = 0; r < rounds; r += 1) {
    for (const [q, ok] of items) {
      const think = pick(q);
      const a = await ask(q, think);
      rows.push({ q, think, ok: ok ? ok.test(a.text) : null, ms: a.ms, answer: a.text.replace(/\s+/g, ' ').slice(-60) });
    }
  }
  const ms = rows.map((x) => x.ms).sort((a, b) => a - b);
  result[mode] = {
    correct: items[0][1] ? rows.filter((x) => x.ok).length : null,
    total: rows.length,
    thinkRate: `${rows.filter((x) => x.think).length}/${rows.length}`,
    medianMs: ms[Math.floor(ms.length / 2)],
    wrong: rows.filter((x) => x.ok === false).map((x) => ({ q: x.q, think: x.think, answer: x.answer })),
  };
}
console.log(JSON.stringify({ platform: process.platform, model, set: setName, rounds, at: new Date().toISOString(), result }, null, 2));
