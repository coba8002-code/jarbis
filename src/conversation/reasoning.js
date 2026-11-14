// 계산·추론이 필요해 보이는 질문인지 판단한다(T224). 빠른 답이 켜져 있어도 이런 질문은 "생각함"으로 보낸다.
// 근거(2026-11-14 실측): 빠른 답은 여러 단계 계산에서 실수(4×7=20). 일상 대화는 빠른 답으로 충분.
// 단순 규칙이라 완벽하지 않다. 놓치면 빠른 답(조금 덜 정확), 잘못 잡으면 생각함(조금 느림)일 뿐 위험하지 않다.
// 2026-11-14 보완(T226): 말로 쓴 수("삼천오백 원", "열두 개", "세 사람")도 수로 세고,
// 활용한 계산 동사("빼고", "곱했더니"), 돈 계산(거스름돈), 경우의 수·거짓말 퍼즐·순위·단위 바꾸기를 잡는다.
// 2026-11-14 보완(T236): 수가 둘 이상인데 "어떻게 돼?·뭐가 와?·무슨 요일"로 묻는 것, 쉼표로 늘어놓은 수열,
// "N일 뒤 무슨 요일", "고르는 방법", "A가 B보다 …" 순서 퍼즐, 센티·밀리리터 같은 단위를 잡는다.

const OPERATORS = /\d\s*[+\-−×x*÷/^]\s*\d|\d\s*%|√|제곱근|제곱|세제곱/i;
// 계산 낱말: 수가 하나 이상 있거나 수량을 묻는 질문일 때만
const MATH_WORDS = /(더하기|빼기|곱하기|나누기|나누면|나눈|몫|나머지|합계|합쳐서|모두 더|평균|비율|확률|각도|넓이|부피|둘레|대각선|빗변|속력|시속|분속|방정식|계산(?![서대])|몇\s*배|거스름|거슬러|(최대공약수|최소공배수|공약수|공배수|약수|배수)(?![구관로])|더하고|더하면|더했|더한|빼고|빼면|뺐|뺀|곱하고|곱하면|곱했|곱한|곱해|나누고|나눴|나눠)/;
// 퍼센트·할인·이자: 수가 있고 수량을 묻는 질문일 때만("배터리 몇 퍼센트 남았어?"는 계산이 아님). "프로"는 아래 PRO_PERCENT로만 본다.
// T253: 퍼센트 계산은 퍼센트·금액을 물을 때만("아이폰 열다섯 프로 무게가 몇 그램"은 제품 이름)
const PERCENT_ASK = /(몇\s*(퍼센트|프로)|얼마|할인|이자|오르|올랐|내리|내렸|늘|줄|깎)/;
// T254: "프로"는 수 바로 뒤에 붙고, 그 수 앞이 제품 이름이 아니며, 뒤에 제품 말(맥스·인치·가격 등)이 없을 때만 퍼센트로 본다.
// "맥북 프로 십육 인치 가격", "아이폰 십육 프로 가격"은 제품 이름이고 "이십 프로 할인"은 퍼센트.
const PRODUCT_WORDS = '아이폰|갤럭시|아이패드|맥북|에어팟|워치|노트북|폰|탭|패드|버즈|[A-Za-z]+';
const PRO_PERCENT = new RegExp(`(?<!(${PRODUCT_WORDS})\\s*)(?<![가-힣])(\\d+|[일이삼사오육칠팔구십백]+|(열|스물|서른|마흔|쉰)?(한|두|세|네|다섯|여섯|일곱|여덟|아홉))\\s*프로(?!\\s*(맥스|플러스|울트라|모델|인치|가격|출시|색|무게|사양|버전))`);
const PERCENT_PLAIN = /(퍼센트|%|할인|이자)/;
// T254: 나누어떨어짐("구백구십구는 삼으로 나누어떨어져?"). "케이크 나눠 먹을"은 아님.
const DIVISIBLE = /(나누어\s*떨어|나눠\s*떨어|나누어떨어|나눠떨어|나머지\s*없이\s*나눠|나머지\s*없이\s*나누)/;
// T254: 요일·기간 범위에서 같은 양을 되풀이("월요일부터 금요일까지 매일 사십 분씩 … 몇 분")
const REPEAT_EACH = /씩/;
const REPEAT_SPAN = /(매일|마다|매주|매달|하루에?|요일부터|요일에서|요일까지|주\s*동안|일\s*동안|달\s*동안)/;
// "씩"이 없어도 범위(…요일부터/에서 …요일까지, N 동안)와 반복(매일·하루에·마다)이 함께 있으면 되풀이 계산으로 본다(T254 보강)
const REPEAT_EVERY = /(매일|마다|매주|매달|하루에)/;
const RANGE = /(요일\s*(부터|에서)[^?]*요일\s*까지|동안)/;
const TOTAL_ASK = /(몇\s*(분|시간|번|개|원|킬로|미터|쪽|잔|일|주)|얼마|모두|전부|총)/;
// T254: 한글로 쓴 기간 합산·바꾸기("삼 주 하고 나흘은 며칠", "백 시간은 며칠 몇 시간")
const DAY_WORDS = '하루|이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘|보름';
const DURATION_TOKEN = new RegExp(`(?<![가-힣])(?:(?:\\d+|[일이삼사오육칠팔구십백천만]+|(?:열|스물|스무|서른|마흔|쉰)(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉)?|한|두|세|네|다섯|여섯|일곱|여덟|아홉)\\s*(?:주|일|시간|분|초|개월|달)|${DAY_WORDS})(?=[^가-힣]|$|[은는이가을를에과와하도랑면만])`, 'g');
const DURATION_ASK = /(며칠|몇\s*(일|주|시간|분|초))/;
// T255: 기간 하나를 다른 단위로 바꾸기("삼 주는 몇 시간", "백이십 분은 몇 시간"). 말한 기간의 단위와 묻는 단위가 다를 때만.
// "이 일 며칠 걸려?"처럼 같은 단위(일)를 물으면 계산이 아니다.
// 바꿀 기간은 주제로 쓰인 것("삼 주는", "이틀은", "나흘이면", "열흘을")만 센다. "한 달 동안 며칠 쉬었는지"처럼 활동 기간(동안·뒤)은 아니다.
const TOPIC_AFTER = /^\s*(은|는|이면|면|이|가|을|를)(?![가-힣]*\s*동안)/;
const DAY_WORD_RE = new RegExp(`^(${DAY_WORDS})$`);
function durationUnitOf(token) {
  if (DAY_WORD_RE.test(token)) return 'day';
  const u = token.match(/(주|일|시간|분|초|개월|달)$/)?.[1];
  return { 주: 'week', 일: 'day', 시간: 'hour', 분: 'min', 초: 'sec', 개월: 'month', 달: 'month' }[u] ?? null;
}
const ASKED_DURATION = /며칠|몇\s*(일|주|시간|분|초|개월|달)(?!에)/g;
function convertsDuration(q) {
  const have = new Set([...q.matchAll(DURATION_TOKEN)]
    .filter((m) => TOPIC_AFTER.test(q.slice(m.index + m[0].length)))
    .map((m) => durationUnitOf(m[0])).filter(Boolean));
  if (have.size === 0) return false;
  const asked = [...q.matchAll(ASKED_DURATION)].map((m) => (m[0] === '며칠' ? 'day' : durationUnitOf(m[1])));
  return asked.some((u) => u && !have.has(u));
}
// T255: 온도 바꾸기("섭씨 삼십칠 도는 화씨로 몇 도"). 섭씨·화씨 두 가지가 다 나오고 수가 있을 때만("오늘 섭씨 몇 도야?"는 아님).
function convertsTemperature(q) {
  const scales = new Set();
  if (/(섭씨|도씨|℃)/.test(q)) scales.add('c');
  if (/(화씨|℉)/.test(q)) scales.add('f');
  return scales.size === 2 && /(섭씨|화씨)\s*(으로|로|몇|는|은)/.test(q);
}
const MIXED_UNIT_ASK = /(며칠\s*몇\s*시간|몇\s*(일|주|시간)\s*몇\s*(일|시간|분|초)|몇\s*시간\s*몇\s*분)/;
// 단위 바꾸기: 수가 있고 길이·무게·부피 단위로 몇인지 물을 때("2.5리터는 몇 밀리리터")
const UNIT_QUESTION = /몇\s*(밀리|미리|센티|킬로|그램|리터|미터|마일|인치|피트|파운드|온스|톤|평|제곱|갤런|야드|cm|mm|ml|kg)/i;
const REASONING_WORDS = /(추론|논리|퍼즐|증명|단계별|차근차근|풀어\s*(줘|봐)|따져\s*봐|어느\s*쪽이|누가\s*(더|가장|거짓말|진실)|거짓말쟁이|가장\s*(작은|큰|많은|적은|키가)|다음\s*(수|숫자)|다음에\s*(오는|올)\s*(수|숫자)|규칙을|수열|어떤\s*수(?=[를을에가는의]|\s|$)|경우의\s*수|(\d|한|두|세|네)\s*등은\s*누|(고르는|고를|뽑는|뽑을|세우는|서는|앉는|앉을|나누는)\s*(방법|경우))/;
// 수가 둘 이상일 때 계산 결과를 묻는 끝말("오 년 뒤 내 나이가 어떻게 돼?")
const RESULT_QUESTION = /(어떻게\s*(돼|되|됩|될)|뭐가\s*(와|돼|나와)|무슨\s*요일|몇\s*(시|월|점|팀|골)|구해|맞혀|얼마나)/;
// 쉼표로 늘어놓은 수 세 개 이상(수열)
const SEQUENCE = /\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*,\s*\d+/;
// 날짜 계산: "N일 뒤 무슨 요일·며칠"
const DATE_SHIFT = /(일|주|달|개월|년)\s*(뒤|후|전)/;
const DATE_ASK = /(무슨\s*요일|며칠|몇\s*(월|일|년))/;
// 순서 퍼즐: "A가 B보다 …, B가 C보다 …" 하고 누구인지 물을 때
const ORDER_PUZZLE = /보다[^?]*보다/;
const WHO = /(누구|누가|어느)/;
// 2026-11-14 보완(T237): 맞는지 따지는 질문, 분수·소수·퍼센트 바꾸기, 약수·배수·소수, 연속한 수, 말로 쓴 셈
const CLAIM = /(맞아|맞지|맞니|맞나|맞는\s*(거|말)|사실이야|틀려|틀리지|틀린\s*(거|말))/;
const NUMBER_THEORY = /(최대공약수|최소공배수|공약수|공배수|소인수)/;
const CONVERT = /(분수|소수|퍼센트|백분율|기약분수|비율)\s*로\s*(바꾸|바꿔|나타내|고치|고쳐|변환|하면|말해|알려|써|표현)/;
const PRIME_ASK = /(소수|약수|배수|짝수|홀수)(야|이야|인지|냐|예요|일까|가\s*(맞|아니)|를|는|가|의|라는|라고|인가|\s*맞)/;
// T253: "몇 분의 몇", 날짜 끝("2월은 며칠까지"), 단위 둘을 비교해 맞는지 따지기
const FRACTION_ASK = /몇\s*분의\s*몇/;
const MONTH_DAYS = /(며칠까지|몇\s*일까지|윤년|평년)/;
// 단위 바꾸기는 수 바로 뒤에 단위가 붙은 것이 있을 때만("2.5리터는 몇 밀리리터", "오 톤은 몇 킬로그램"). 제품 번호는 제외.
const UNIT_AFTER_NUMBER = /(\d|[일이삼사오육칠팔구십백천만]|다섯|여섯|일곱|여덟|아홉|열|스물|스무|서른|마흔|쉰|한|두|세|네|반)\s*(밀리그램|킬로그램|그램|킬로미터|센티미터|밀리리터|밀리|리터|미터|킬로|센티|톤|인치|피트|갤런|온스|마일|야드|평|파운드|cm|mm|ml|kg|km)/i;
// 단위 종류(길이·무게·부피·넓이). 바꿀 수 있는 것은 같은 종류끼리뿐("십육 인치 … 몇 그램"은 제품 정보 찾기).
const UNIT_KIND = [
  [/^(밀리미터|미리|센티미터|센티|킬로미터|미터|인치|피트|야드|마일|cm|mm|km)$/i, ['length']],
  [/^(밀리그램|킬로그램|그램|톤|파운드|kg)$/i, ['mass']],
  [/^(밀리리터|밀리|리터|갤런|ml)$/i, ['volume']],
  [/^(평|제곱)$/, ['area']],
  [/^킬로$/, ['length', 'mass']],
  [/^온스$/, ['mass', 'volume']],
];
const kindsOf = (unit) => UNIT_KIND.find(([re]) => re.test(unit))?.[1] ?? [];
const UNIT_ASKED = /몇\s*(밀리그램|밀리미터|밀리리터|밀리|미리|센티미터|센티|킬로그램|킬로미터|킬로|그램|리터|미터|마일|인치|피트|파운드|온스|톤|평|제곱|갤런|야드|cm|mm|ml|kg|km)/gi;
function sameKindConversion(q) {
  const have = new Set([...q.matchAll(new RegExp(UNIT_AFTER_NUMBER.source, 'gi'))].flatMap((m) => kindsOf(m[2])));
  return [...q.matchAll(UNIT_ASKED)].some((m) => kindsOf(m[1]).some((k) => have.has(k)));
}
const UNIT_NAMES = /(밀리그램|킬로그램|그램|킬로미터|센티미터|밀리리터|리터|미터|킬로|센티|톤|인치|피트|갤런|온스|마일|야드|평|파운드)/g;
const CONSECUTIVE = /연속(된|한|하는|으로)?\s*\S{0,4}\s*(자연수|정수|짝수|홀수|수)/;
const SUM_ASK = /(?<![가-힣])합(이|은|을|계)/;
// 말로 쓴 셈("십 더하기 오", "삼분의 일", "영 점 칠오")
const SPOKEN_ARITH = /[일이삼사오육칠팔구십백천만영]+\s*(더하기|빼기|곱하기|나누기)\s*[일이삼사오육칠팔구십백천만영]+/;
const SPOKEN_NUMBER = /(?<![가-힣])([일이삼사오육칠팔구십백천만]+\s*분의\s*[일이삼사오육칠팔구십]+|영\s*점\s*[영일이삼사오육칠팔구]+|\d+\s*분의\s*\d+)/g;
const QUANTITY_QUESTION = /(몇\s*(개|명|살|시간|분|초|번|km|킬로|미터|밀리|리터|그램|원|일째|일|도|배|마리|대|퍼센트|프로|쪽|컵|잔|년|개월|달|주|가지|층|장|권|병))|며칠|얼마/;
const NUMBER_COMPARE = /(더\s*(큰|작은)|큰\s*수|작은\s*수|두\s*배|세\s*배|배로)/;
// 말로 쓴 수 + 세는 말. 한자어 수("삼천오백 원", "사십 분")와 고유어 수("열두 개", "세 사람").
const SINO = /(?<![가-힣])[일이삼사오육칠팔구십백천만]{1,8}\s*(원|쪽|분|초|년|개월|일|주|밀리그램|밀리리터|밀리|리터|센티미터|센티|킬로미터|킬로그램|미터|킬로|그램|톤|인치|피트|갤런|온스|마일|야드|평|파운드|퍼센트|프로|도|층|세)(?=[^가-힣]|$|[이은는을를에으과와짜씩까부만인쯤가동면])/g;
const NATIVE = /(?<![가-힣])(열|스물|스무|서른|마흔|쉰|예순|일흔|여든|아흔)?(한|두|세|네|다섯|여섯|일곱|여덟|아홉)?\s*(사람|명|개|번|마리|살|권|장|대|잔|병|컵|켤레|쌍|가지|조각|송이|자루|그릇|상자|봉지|시간|시|날|달|주|쪽|종류|센티|미터|킬로|리터|온스|인치|피트|갤런|톤|평)/g;
// 세는 말 없이 쓴 고유어 수("마흔다섯이고", "열다섯인데", "열일곱은"). "열"만 있으면 "열어"와 헷갈려 세지 않는다.
const NATIVE_BARE = /(?<![가-힣])((열|스물|서른|마흔|쉰|예순|일흔|여든|아흔)(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉)|(스물|서른|마흔|쉰|예순|일흔|여든|아흔))(?=이고|인데|이면|이랑|이야|이에요|과|와|살|은|는|을|를|이|가|\s|$)/g;
// T253: 다섯~아홉만 쓴 고유어 수("세로가 여섯인"), 세는 말 없는 한자어 수("칠십일은", 십·백·천·만이 들어간 것만),
// "백 이하"처럼 범위를 말하는 수
const NATIVE_UNIT_BARE = /(?<![가-힣])(다섯|여섯|일곱|여덟|아홉)(?=이|인|과|와|은|는|을|를|하고|이랑|\s|$)/g;
const SINO_BARE = /(?<![가-힣])[일이삼사오육칠팔구]*[십백천만][일이삼사오육칠팔구십백천만]*(?=은|는|이|가|을|를|과|와|하고|이랑|에|의|으로|로|\s|$)/g;
const SINO_RANGE = /(?<![가-힣])[일이삼사오육칠팔구십백천만]+\s*(이하|이상|미만|초과|까지|부터)/g;
// "열두와 열여덟"처럼 열+한·두·세·네 뒤에 이음말이 올 때
const NATIVE_BARE_SHORT = /(?<![가-힣])(열|스물|서른|마흔|쉰|예순|일흔|여든|아흔)(한|두|세|네)(?=와|과|하고|이랑|랑|의)/g;

function numberCount(q) {
  const digitNums = (q.match(/\d+(\.\d+)?/g) ?? []).length;
  const sino = (q.match(SINO) ?? []).length;
  // NATIVE는 수 낱말 없이 세는 말만 있어도 맞으므로 수 낱말이 있는 것만 센다
  const native = (q.match(NATIVE) ?? []).filter((m) => /^(열|스물|스무|서른|마흔|쉰|예순|일흔|여든|아흔|한|두|세|네|다섯|여섯|일곱|여덟|아홉)/.test(m)).length;
  // 한자어 수는 세는 말이 붙은 것(SINO)과 겹치지 않게, 세는 말 없는 것만 더 센다
  const sinoBare = (q.replace(SINO, ' ').replace(SPOKEN_NUMBER, ' ').match(SINO_BARE) ?? []).length;
  return digitNums + sino + native + (q.match(NATIVE_BARE) ?? []).length
    + (q.match(NATIVE_BARE_SHORT) ?? []).length + (q.match(SPOKEN_NUMBER) ?? []).length
    + (q.match(NATIVE_UNIT_BARE) ?? []).length + sinoBare + (q.match(SINO_RANGE) ?? []).length
    + (q.match(/(?<![가-힣])반\s*(킬로|그램|리터|미터|갤런|톤|인치|피트|마일)/g) ?? []).length;
}

export function needsThinking(question) {
  const q = String(question ?? '');
  const numbers = numberCount(q);
  if (OPERATORS.test(q)) return { think: true, reason: '계산식' };
  if (MATH_WORDS.test(q) && (numbers > 0 || QUANTITY_QUESTION.test(q))) return { think: true, reason: '계산 낱말' };
  if ((PERCENT_PLAIN.test(q) || PRO_PERCENT.test(q)) && numbers > 0 && QUANTITY_QUESTION.test(q) && PERCENT_ASK.test(q)) return { think: true, reason: '계산 낱말' };
  if (numbers > 0 && DIVISIBLE.test(q)) return { think: true, reason: '계산 낱말' };
  if (numbers > 0 && TOTAL_ASK.test(q) && ((REPEAT_EACH.test(q) && REPEAT_SPAN.test(q)) || (REPEAT_EVERY.test(q) && RANGE.test(q)))) return { think: true, reason: '숫자와 수량 질문' };
  {
    const durations = (q.match(DURATION_TOKEN) ?? []).length;
    if ((durations >= 2 && DURATION_ASK.test(q)) || (durations >= 1 && MIXED_UNIT_ASK.test(q))) return { think: true, reason: '날짜 계산' };
    if (convertsDuration(q)) return { think: true, reason: '단위 바꾸기' };
  }
  if (numbers > 0 && convertsTemperature(q)) return { think: true, reason: '단위 바꾸기' };
  if (FRACTION_ASK.test(q)) return { think: true, reason: '계산 낱말' };
  if (numbers > 0 && MONTH_DAYS.test(q)) return { think: true, reason: '날짜 계산' };
  if (numbers > 0 && CLAIM.test(q) && new Set(q.match(UNIT_NAMES) ?? []).size >= 2) return { think: true, reason: '단위 바꾸기' };
  if (UNIT_QUESTION.test(q) && numbers > 0 && sameKindConversion(q)) return { think: true, reason: '단위 바꾸기' };
  if (REASONING_WORDS.test(q)) return { think: true, reason: '추론 낱말' };
  if (SEQUENCE.test(q) && /(다음|그\s*뒤|규칙|빈칸|뭐가|무엇|몇)/.test(q)) return { think: true, reason: '수열' };
  if (ORDER_PUZZLE.test(q) && (WHO.test(q) || CLAIM.test(q))) return { think: true, reason: '추론 낱말' };
  if (NUMBER_THEORY.test(q) || CONSECUTIVE.test(q) || SPOKEN_ARITH.test(q)) return { think: true, reason: '계산 낱말' };
  if (numbers > 0 && (CONVERT.test(q) || PRIME_ASK.test(q) || SUM_ASK.test(q))) return { think: true, reason: '계산 낱말' };
  if (numbers >= 2 && CLAIM.test(q)) return { think: true, reason: '숫자와 수량 질문' };
  if (numbers > 0 && DATE_SHIFT.test(q) && DATE_ASK.test(q)) return { think: true, reason: '날짜 계산' };
  if (numbers >= 2 && RESULT_QUESTION.test(q)) return { think: true, reason: '숫자와 수량 질문' };
  // 여러 자리 숫자 하나("48일째")도 수가 둘 있는 것처럼 본다(T224 때 규칙 유지)
  const many = numbers >= 2 || (q.match(/\d/g) ?? []).length >= 2;
  if (many && QUANTITY_QUESTION.test(q)) return { think: true, reason: '숫자와 수량 질문' };
  if (many && NUMBER_COMPARE.test(q)) return { think: true, reason: '숫자 비교' };
  return { think: false, reason: null };
}
