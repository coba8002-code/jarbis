import { AppError } from '../errors.js';

// 이 기기 기억·회의록 검색 실행기(FR-007a). 읽기만 하고, 결과에는 번호(회의는 구간 번호·시간)만 담는다.
// 원문을 미션 결과에 남기지 않아, 나중에 기억·녹취를 지우면 그 내용이 미션 기록에도 남지 않는다.
export function searchExecutors({ memory, meetings }) {
  const queryOf = (mission) => {
    const q = mission.content?.query;
    if (typeof q !== 'string' || q.trim() === '' || q.trim().length > 100) throw new AppError('invalid_input', '검색어가 잘못됨');
    return q.trim();
  };
  return {
    'local.memory.search': async (mission) => {
      const ids = memory.search(queryOf(mission)).map((m) => m.id);
      return { count: ids.length, memoryIds: ids };
    },
    'local.meeting.search': async (mission) => {
      const r = meetings.search(queryOf(mission));
      return {
        count: r.segmentCount,
        truncated: r.truncated,
        hits: r.results.map((x) => ({
          meetingId: x.meeting.id,
          titleMatch: x.titleMatch,
          segments: x.segments.map((s) => ({ id: s.id, start_ms: s.start_ms, end_ms: s.end_ms })),
        })),
      };
    },
  };
}

// 1단계 실행기는 외부 작업을 하지 않는 모의 실행기만 둔다.
export function defaultExecutors() {
  return {
    'mock.echo': async (mission) => ({ echoed: mission.content }),
    'mock.fail': async () => {
      throw new AppError('executor_failed', '모의 실패');
    },
  };
}
