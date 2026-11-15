// 단축키 판 아이콘(24×24 선 그림, 직접 그림). 메인 화면(deck.js)과 설정 화면(deck-settings.js)이 함께 쓴다.
export const ICON_PATHS = {
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  chat: '<path d="M5 18l-1 3 4-1.5A8.5 8.5 0 1 0 5 18z"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l4 6M21 9l-4 6"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  app: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  home: '<path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z"/>',
  music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  'volume-up': '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  'volume-down': '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 12h4"/>',
  bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11.5 3.5v2.5"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
};
export const ICON_NAMES = {
  calendar: '달력', check: '체크', sun: '해', chat: '말풍선', speaker: '스피커', mute: '음소거', stop: '멈춤', play: '재생', mic: '마이크',
  app: '프로그램', keyboard: '키보드', globe: '지구', star: '별', heart: '하트', home: '집', music: '음악', 'volume-up': '소리 크게', 'volume-down': '소리 작게',
  bolt: '번개', camera: '카메라', coffee: '커피', moon: '달', gear: '톱니', search: '찾기',
};
export const COLOR_NAMES = { orange: '주황', blue: '파랑', green: '초록', pink: '분홍', purple: '보라', yellow: '노랑', teal: '청록', gray: '회색' };
// 버튼 색(밝은 화면·어두운 화면). 바탕은 옅게, 아이콘·글자는 진하게(대비 4.5:1 이상).
export const COLOR_VALUES = {
  orange: ['#ffedd5', '#9a3412', '#3a2616', '#fdba74'],
  blue: ['#dbeafe', '#1e40af', '#172554', '#93c5fd'],
  green: ['#dcfce7', '#166534', '#14301f', '#86efac'],
  pink: ['#fce7f3', '#9d174d', '#3b1428', '#f9a8d4'],
  purple: ['#ede9fe', '#5b21b6', '#2a1a4a', '#c4b5fd'],
  yellow: ['#fef9c3', '#854d0e', '#3a3110', '#fde047'],
  teal: ['#ccfbf1', '#115e59', '#0f302d', '#5eead4'],
  gray: ['#f1efec', '#44403c', '#2a2622', '#d6d3d1'],
};
export const ACTION_NAMES = {
  ask: '자비스에게 물어보기', open: '화면 열기', voice: '소리 켜고 끄기', stop: '멈추기', briefing: '브리핑 듣기',
  'pc-app': 'PC 프로그램 열기', 'pc-keys': 'PC 단축키 보내기', 'pc-url': 'PC에서 웹 주소 열기',
  'pc-text': 'PC에 글자 입력', multi: '여러 동작 한 번에(PC)', widget: '실시간 버튼(시계·PC 상태)',
};
export const WIDGET_NAMES = { clock: '시계', 'pc-stats': 'PC 상태(CPU·메모리)' };
// 여러 동작에 넣을 수 있는 칸
export const STEP_NAMES = { 'pc-keys': 'PC 단축키 보내기', 'pc-app': 'PC 프로그램 열기', 'pc-url': 'PC에서 웹 주소 열기', 'pc-text': 'PC에 글자 입력', wait: '기다리기' };
export const isPcAction = (a) => Boolean(a && (String(a.type).startsWith('pc-') || a.type === 'multi'));
export const VIEW_NAMES = { calendar: '일정', tasks: '할 일', briefing: '오늘 브리핑', check: '장치 점검', settings: '설정', pals: '친구 고르기' };

export function iconSvg(name, size = 24) {
  const d = ICON_PATHS[name] ?? ICON_PATHS.star;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

// 버튼 색 CSS 변수(밝은·어두운 화면 둘 다). 화면마다 <style>에 한 번 넣는다.
export function colorCss(selector = '.deck-btn') {
  const light = Object.entries(COLOR_VALUES).map(([k, [bg, fg]]) => `${selector}[data-color="${k}"]{--b-bg:${bg};--b-fg:${fg}}`).join('');
  const dark = Object.entries(COLOR_VALUES).map(([k, [, , bg, fg]]) => `${selector}[data-color="${k}"]{--b-bg:${bg};--b-fg:${fg}}`).join('');
  return `${light}@media (prefers-color-scheme: dark){${dark}}`;
}
