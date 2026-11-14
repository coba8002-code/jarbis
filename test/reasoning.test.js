// 계산·추론 질문 판단 규칙 검사. 2026-11-14 품질 비교에 쓴 문제와 일상 대화로 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { needsThinking } from '../src/conversation/reasoning.js';

// 품질 비교의 어려운 문제(빠른 답이 실수한 종류 포함) — 모두 생각함으로 가야 한다
const hard = [
  'A는 B보다 3살 많고, B는 C 나이의 두 배야. C가 7살이면 A는 몇 살이야?',
  '1부터 100까지 모두 더하면?',
  '시계가 3시 15분일 때 시침과 분침 사이 각도는 몇 도야?',
  '어떤 일을 A 혼자 하면 6시간, B 혼자 하면 3시간 걸려. 둘이 같이 하면 몇 시간 걸려?',
  '배트와 공이 합쳐서 1100원이고 배트가 공보다 1000원 비싸. 공은 얼마야?',
  '연못의 연잎이 매일 두 배로 늘어서 48일째에 연못을 다 덮어. 절반을 덮는 날은 며칠째야?',
  '기계 5대가 5분에 물건 5개를 만들어. 기계 100대가 물건 100개를 만드는 데 몇 분 걸려?',
  '9.11과 9.9 중 더 큰 수는?',
  '어떤 수를 4로 나누면 몫이 7이고 나머지가 3이야. 그 수는?',
  '17 곱하기 23은?',
  '2, 6, 12, 20, 30 다음 수는?',
  '철수는 영희보다 키가 크고, 영희는 민수보다 키가 커. 가장 키가 작은 사람은?',
  '35 * 12 계산해 줘',
  '시속 60km로 2시간 30분 동안 가면 몇 km를 가?',
  // 2026-11-14 자동이 놓쳤던 것(T226)
  '세 사람이 서로 한 번씩 악수하면 악수는 모두 몇 번이야?',
  '어떤 수에서 8을 빼고 2를 곱했더니 18이야. 그 수는?',
];

// 일상 대화 — 빠른 답으로 남아야 한다
const casual = [
  '안녕',
  '자비스 오늘 날씨 어때?',
  '음악 좀 틀어 줘',
  '내일 오후 3시에 회의 일정 잡아 줘',
  '고마워 자비스',
  '재미있는 이야기 하나 해 줘',
  '점심 메뉴 추천해 줘',
  '오늘 기분이 좀 안 좋아',
  '영어로 안녕은 뭐야?',
  '책 한 권 추천해 줘',
  '하늘이 파란 이유를 두 문장으로 설명해 줘',
  '알람 7시에 맞춰 줘',
  '방금 한 말 다시 해 줘',
  '이메일 확인해 줘',
  // 한글 수 낱말·계산 동사가 있어도 계산이 아닌 것(T226 보완 뒤 잘못 잡지 않는지)
  '세 시에 깨워 줘',
  '두 사람 자리 예약해 줘',
  '어떤 수업 들어?',
  '이 노래 목록에서 빼 줘',
  '다섯 곡만 틀어 줘',
];

test('어려운 계산·추론 문제는 모두 생각함으로 보낸다', () => {
  const missed = hard.filter((q) => !needsThinking(q).think);
  assert.deepEqual(missed, []);
});

test('일상 대화는 빠른 답으로 남긴다', () => {
  const caught = casual.filter((q) => needsThinking(q).think);
  assert.deepEqual(caught, []);
});

test('판단 이유를 알려 주고, 빈 값도 안전하게 처리한다', () => {
  assert.equal(needsThinking('17 + 25는?').reason, '계산식');
  assert.equal(needsThinking('어떤 수를 4로 나누면 몫이 7이야').reason, '계산 낱말');
  assert.equal(needsThinking('이 퍼즐 풀어 줘').reason, '추론 낱말');
  assert.deepEqual(needsThinking(undefined), { think: false, reason: null });
  assert.deepEqual(needsThinking(''), { think: false, reason: null });
});

// 2026-11-14 보완(T226·T236·T237). 문제는 규칙을 만드는 사람과 따로 만든 묶음이다(test/fixtures).
// dev·dev2·dev3: 규칙을 고칠 때 본 묶음. dev2는 T226 때, dev3은 T236 때의 holdout이었다.
// holdout: T237 규칙을 다 고친 뒤 한 번만 평가한 묶음(그때 결과를 바닥값으로 둠). 이 묶음을 보고 규칙을 고치면 새 묶음이 필요하다.
const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

for (const name of ['reasoning-dev', 'reasoning-dev2']) {
  test(`${name} 묶음: 계산은 모두 생각함, 일상은 모두 빠른 답`, () => {
    const set = load(name);
    assert.deepEqual(set.calc.filter((q) => !needsThinking(q).think), []);
    assert.deepEqual(set.casual.filter((q) => needsThinking(q).think), []);
  });
}

test('dev3 묶음(T236 평가 묶음): T236 때 놓친 5개까지 모두 잡고, 일상은 모두 빠른 답', () => {
  const set = load('reasoning-dev3');
  assert.deepEqual(set.calc.filter((q) => !needsThinking(q).think), []);
  assert.deepEqual(set.casual.filter((q) => needsThinking(q).think), []);
});

test('T237 학습 예시: 맞는지 따지기·분수/소수 바꾸기·약수/소수·연속한 수·말로 쓴 셈', () => {
  const calc = ['십 더하기 오가 십오 맞지?', '삼분의 일을 소수로 나타내면?', '17이 소수야?', '91은 소수인지 알려 줘', '오십 평은 몇 제곱미터야?',
    '두 수의 합이 20이고 차가 4면 두 수는?', '12와 18의 공약수 다 알려 줘', '5갤런은 몇 리터야?', '7 곱하기 8이 54 맞아?'];
  const casual = ['서울이 한국 수도 맞지?', '오늘 비 온다는 거 맞아?', '분수대 근처 카페 알려 줘', '소수 의견도 들어 봐', '배터리 퍼센트 표시 켜 줘',
    '이 배는 몇 톤짜리야?', '우리 궁합이 맞아?', '정수기 필터 언제 바꿔?', '3번 버스 맞지?', '2시 회의 맞아?', '짝수 날에 알람 맞춰 줘', '합이 잘 맞는 친구'];
  assert.deepEqual(calc.filter((q) => !needsThinking(q).think), []);
  assert.deepEqual(casual.filter((q) => needsThinking(q).think), []);
});

test('T253 학습 예시: 같은 종류 단위 바꾸기는 생각함, 제품 번호·다른 종류 단위·말로 쓴 수가 든 일상은 빠른 답', () => {
  const calc = ['5킬로미터는 몇 마일이야?', '3.5킬로는 몇 그램이야?', '이십 평은 몇 제곱미터야?', '팔 온스는 몇 밀리리터야?', '반 킬로그램은 몇 그램이야?'];
  const casual = ['일이 많아서 피곤해', '천만에요', '이 주 일정 알려 줘', '갤럭시 에스 이십오 울트라 가격 알려 줘', '맥북 프로 십육 인치 무게 몇 그램이야?',
    '오만한 사람 대처법', '백 번 버스 언제 와?', '다섯 시에 깨워 줘', '여섯 시 반 알람', '이번 달은 며칠까지 있어?', '오늘 이십 도야?',
    '칠십 년대 노래 틀어 줘', '에어팟 프로 배터리 몇 퍼센트야?', '삼성 갤럭시 몇 그램이야?', '구십 퍼센트 확신해'];
  assert.deepEqual(calc.filter((q) => !needsThinking(q).think), []);
  assert.deepEqual(casual.filter((q) => needsThinking(q).think), []);
});

// T255: T254 때의 평가 묶음(dev6, sha256 앞 67418444e6c650cb)을 회귀 검사로 바꿨다. 수정 전 미공개 평가 기록(57/60, 오판 0)은 tasks.md에 남기고,
// 여기서는 그때 놓친 3개까지 모두 맞혀야 한다(허용값 없음). 지금은 미공개 평가 묶음이 없다.
test('dev6 묶음(T254 평가 묶음): 놓쳤던 3개까지 모두 잡고, 일상은 모두 빠른 답', () => {
  const set = load('reasoning-dev6');
  assert.deepEqual(set.calc.filter((q) => !needsThinking(q).think), []);
  assert.deepEqual(set.casual.filter((q) => needsThinking(q).think), []);
});

test('T255: 단일 기간 단위 바꾸기·온도 바꾸기·기간 조사 변형은 생각함, 비슷한 일상 요청은 빠른 답', () => {
  const calc = [
    '보름 하고 닷새면 며칠이야?', '삼 주는 몇 시간이야?', '섭씨 삼십칠 도는 화씨로 몇 도야?',
    '이틀은 몇 시간이야?', '백이십 분은 몇 시간이야?', '열흘은 몇 시간인지 알려 줘', '두 달은 대략 며칠이야?', '한 주는 몇 분이야?',
    '화씨 백 도는 섭씨로 몇 도야?', '25도씨는 화씨로 몇 도야?', '섭씨 영하 십 도를 화씨로 바꾸면?', '화씨 팔십육 도면 섭씨 몇 도지?',
    '나흘이면 몇 시간이야?', '사흘에 닷새를 합치면 며칠?',
  ];
  const casual = [
    '오늘 섭씨 몇 도야?', '화씨로 온도 표시 바꿔 줘', '지금 밖은 화씨 몇 도야?', '섭씨랑 화씨 차이가 뭐야?',
    '삼 주는 너무 길어', '두 시간은 걸릴까?', '이틀은 쉬어야겠다', '다음 주 몇 시에 회의야?', '이 일 며칠 걸려?',
    '세 시간 뒤에 깨워 줘', '열흘 동안 여행 가', '한 시간 동안 집중 모드 켜 줘',
    '한 달 동안 며칠 쉬었는지 기록 보여 줘', '이틀 뒤 몇 시에 출발해?', '에어컨 섭씨 이십육 도로 맞춰 줘', '오늘 화씨로 몇 도야?', '섭씨 화씨 변환 앱 추천해 줘',
  ];
  assert.deepEqual(calc.filter((q) => !needsThinking(q).think), []);
  assert.deepEqual(casual.filter((q) => needsThinking(q).think), []);
});

test('T254 보강(독립 검증에서 나온 변형): "에서"·"씩" 없는 범위 반복, "랑"·"합치면"·"면" 기간 합산', () => {
  const calc = [
    '화요일에서 토요일까지 매일 이십 분 걸으면 총 몇 분이야?', '두 주랑 사흘을 합치면 며칠?',
    '월요일부터 목요일까지 매일 삼십 분 공부하면 모두 몇 분이야?', '수요일에서 일요일까지 하루에 만 원 쓰면 전부 얼마야?',
    '이 주 동안 매일 다섯 페이지 읽으면 총 몇 쪽이야?', '사흘이랑 열흘 더하면 며칠이야?', '한 주와 나흘이면 며칠이지?', '보름 하고 이틀이면 며칠이야?',
  ];
  const casual = [
    '화요일에서 토요일까지 매일 알람 맞춰 줘', '두 주랑 사흘 휴가 내고 싶어', '월요일에서 금요일까지 매일 몇 시에 일어나?',
    '이 주 동안 매일 아침 뉴스 읽어 줘', '사흘이랑 나흘 중에 언제 쉬는 게 좋아?', '주말 이틀 동안 할 일 정리해 줘',
  ];
  assert.deepEqual(calc.filter((q) => !needsThinking(q).think), []);
  assert.deepEqual(casual.filter((q) => needsThinking(q).think), []);
});

// T254: T253 때의 평가 묶음(dev5)을 학습 자료로 바꿨다. 그때 놓친 4개·오판 1개까지 모두 맞혀야 한다.
test('dev5 묶음(T253 평가 묶음): 놓쳤던 4개까지 모두 잡고, 일상은 모두 빠른 답', () => {
  const set = load('reasoning-dev5');
  assert.deepEqual(set.calc.filter((q) => !needsThinking(q).think), []);
  assert.deepEqual(set.casual.filter((q) => needsThinking(q).think), []);
});

test('T254 학습 예시: 나누어떨어짐·요일 범위 반복·한글 기간 합산·퍼센트 계산과 변형, 제품 이름 "프로"와 일상 함정', () => {
  const calc = [
    // 나누어떨어짐
    '구백구십구는 삼으로 나누어떨어져?', '이천사십팔은 팔로 나누어떨어지나?', '144는 12로 나눠떨어져?',
    '삼백육십은 칠로 나누어떨어지는지 알려 줘', '백이십삼이 사로 나머지 없이 나눠져?',
    // 요일·기간 범위에서 반복
    '월요일부터 금요일까지 매일 사십 분씩 걸으면 일주일에 몇 분이야?', '화요일부터 토요일까지 하루 두 시간씩 공부하면 모두 몇 시간이야?',
    '주말마다 삼천 원씩 모으면 한 달에 얼마야?', '매일 이십 분씩 운동하면 이 주 동안 몇 분이야?',
    // 한글 기간 합산·바꾸기
    '삼 주 하고 나흘은 며칠이야?', '이 주 사흘은 모두 며칠이야?', '열흘하고 이틀이면 며칠이지?', '백 시간은 며칠 몇 시간이야?', '보름에 닷새를 더하면 며칠이야?',
    // 퍼센트 계산(숫자 + 프로)
    '이십 프로 할인하면 삼만 원짜리가 얼마야?', '오만 원에서 십오 프로 깎으면 얼마야?',
  ];
  const casual = [
    // 제품 이름 "프로"·크기·모델 번호
    '맥북 프로 십육 인치 가격 얼마야?', '아이폰 십육 프로 가격 얼마야?', '갤럭시 탭 에스 구 프로 가격 얼마야?',
    '아이패드 프로 십삼 인치 출시일 알려 줘', '에어팟 프로 이 가격 얼마야?', '아이폰 열다섯 프로 맥스 무게 몇 그램이야?',
    // 요일·기간이 있지만 계산이 아닌 요청
    '월요일부터 금요일까지 일정 보여 줘', '매일 일곱 시에 알람 맞춰 줘', '이 주 동안 알림 꺼 줘', '사흘 뒤에 알려 줘',
    '삼 주 동안 운동 계획 짜 줘', '월요일부터 수요일까지 매일 아침 날씨 알려 줘', '나흘 연휴 여행지 추천해 줘',
    // "나누다"의 다른 뜻
    '케이크 나눠 먹을 사람 있어?', '의견을 나누다가 무슨 뜻이야?', '반으로 나눠서 담아 줘',
  ];
  assert.deepEqual(calc.filter((q) => !needsThinking(q).think), []);
  assert.deepEqual(casual.filter((q) => needsThinking(q).think), []);
});

// T253: T237 때의 평가 묶음(dev4)을 학습 자료로 바꿨다. 그때 놓친 16개·오판 1개를 포함해 모두 맞혀야 한다.
test('dev4 묶음(T237 평가 묶음): 놓쳤던 16개까지 모두 잡고, "프로" 오판 없이 일상은 모두 빠른 답', () => {
  const set = load('reasoning-dev4');
  assert.deepEqual(set.calc.filter((q) => !needsThinking(q).think), []);
  assert.deepEqual(set.casual.filter((q) => needsThinking(q).think), []);
});
