// JARVIS 끄기 순서. Windows·macOS 공통.
// 2026-11-14 독립 QA 결함: 화면 서버 닫기(app.close)를 먼저 기다리면, 취소될 때까지 끝나지 않는 답 생성 요청 때문에
// 취소 단계(services.close)에 닿지 못해 꺼지지 않았다.
// 순서: 1) 진행 중인 일 끊기 → 2) 화면 서버 닫기(제한 시간이 지나면 남은 연결을 끊음) → 3) DB·자식 프로세스 닫기.
export async function shutdown(app, services, { timeoutMs = 3000 } = {}) {
  services.cancelAll();
  const closed = app.close();
  // 끊긴 요청이 응답을 보내고 쉬는 연결(keep-alive)이 되면 바로 닫는다(기다리면 Node 기본 5초 동안 남음).
  const idle = setInterval(() => app.server.closeIdleConnections?.(), 50);
  const timer = setTimeout(() => app.server.closeAllConnections?.(), timeoutMs);
  try {
    await closed;
  } finally {
    clearInterval(idle);
    clearTimeout(timer);
  }
  services.close();
}
