// 사람이 왔는지 알아채고 화면을 깨우는 판단(2026-11-14 사용자 요청: 카메라를 계속 켜 두면 열이 나므로
// 근접 센서 등에 반응할 때만 카메라를 잠깐 켜고, 자원을 최대한 적게 쓴다).
// - 이 파일은 계산만 한다(카메라·화면을 직접 다루지 않음). 화면(jarvis.html)이 장치 값을 넣어 준다.
// - 상태: awake(쓰는 중) → idle(잠시 손 안 댐) → asleep(쉬는 화면). 누름·근접·움직임이 있으면 awake.
// - 카메라 "잠깐 보기"는 awake가 아닐 때만, idle은 15초·asleep은 30초마다 한 번(작은 그림 두 장). 그림은 저장·전송하지 않는다.

export const DEFAULTS = Object.freeze({
  idleMs: 60_000, // 손 안 댄 지 1분이면 idle
  sleepMs: 180_000, // 3분이면 쉬는 화면
  glanceIdleMs: 15_000,
  glanceSleepMs: 30_000,
  motionThreshold: 10, // 밝기 맞춘 뒤 픽셀 평균 차이(0~255)
});

// RGBA 픽셀 → 회색(0~255) 배열
export function toGray(rgba) {
  const n = Math.floor(rgba.length / 4);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const j = i * 4;
    out[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return out;
}

// 두 회색 그림의 차이. 카메라가 켜지며 밝기를 맞추는 동안 전체가 밝아지거나 어두워지는 것은 빼고(평균을 뺌) 모양 차이만 본다.
export function motionScore(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < a.length; i += 1) { ma += a[i]; mb += b[i]; }
  ma /= a.length;
  mb /= b.length;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs((a[i] - ma) - (b[i] - mb));
  return sum / a.length;
}

export function createPresence(options = {}) {
  const o = { ...DEFAULTS, ...options };
  let state = 'awake';
  let lastActive = 0;
  let lastGlance = -Infinity;
  let ref = null; // 지난번 잠깐 보기의 그림(장면이 바뀌었는지 비교)
  let reason = 'start';

  const wake = (t, why) => {
    lastActive = t;
    reason = why;
    const changed = state !== 'awake';
    state = 'awake';
    return changed;
  };

  return {
    get state() { return state; },
    get reason() { return reason; },
    // 시작 시각
    start(t) { lastActive = t; state = 'awake'; reason = 'start'; },
    // 누름·입력·대화 진행 중
    activity(t) { return wake(t, 'touch'); },
    // 근접 센서가 "가까움"을 알림
    near(t) { return wake(t, 'near'); },
    // 시간이 흐름: 바뀌었으면 true
    tick(t) {
      const quiet = t - lastActive;
      const next = quiet >= o.sleepMs ? 'asleep' : quiet >= o.idleMs ? 'idle' : 'awake';
      if (next === state) return false;
      state = next;
      return true;
    },
    // 지금 카메라로 잠깐 볼 차례인가(카메라 깨우기를 켰을 때만 화면이 묻는다)
    shouldGlance(t) {
      if (state === 'awake') return false;
      const every = state === 'asleep' ? o.glanceSleepMs : o.glanceIdleMs;
      return t - lastGlance >= every;
    },
    // 잠깐 보기 결과: 같은 순간 두 장(first, second)의 움직임 + 지난번 그림과의 장면 차이
    glance(t, first, second) {
      lastGlance = t;
      const moving = motionScore(first, second);
      const changed = ref ? motionScore(ref, second) : 0;
      ref = second;
      const seen = moving >= o.motionThreshold || changed >= o.motionThreshold;
      if (seen) wake(t, 'camera');
      return { seen, moving, changed };
    },
    // 카메라 깨우기를 끄거나 다시 켤 때 지난 그림을 버린다
    forget() { ref = null; lastGlance = -Infinity; },
  };
}
