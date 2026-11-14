import { AppError } from '../errors.js';

// Quick Action은 직접 실행하지 않는다. 항상 승인 대기 미션을 만든다.
export function defaultQuickActions() {
  return {
    echo: {
      description: '입력한 글을 그대로 돌려주는 모의 작업',
      kind: 'mock.echo',
      build: (params) => ({
        title: '모의 메아리',
        target: 'local:mock',
        content: { text: params.text ?? '' },
        impact: '외부 전송 없음. 로컬 기록만 남김',
      }),
    },
    'fail-demo': {
      description: '실패 처리를 확인하는 모의 작업',
      kind: 'mock.fail',
      build: () => ({
        title: '모의 실패',
        target: 'local:mock',
        content: {},
        impact: '외부 전송 없음. 실패 기록만 남김',
      }),
    },
  };
}

// 검색어 검사: 비어 있으면 안 되고 100자 이하. 비밀처럼 보이는 값은 미션 만들 때 거부된다(missions.create).
export function searchQuery(params = {}) {
  const q = params.q ?? params.text;
  if (typeof q !== 'string' || q.trim() === '') throw new AppError('invalid_input', '검색어가 비어 있음');
  if (q.trim().length > 100) throw new AppError('invalid_input', '검색어는 100자 이하');
  return q.trim();
}

// 실제 로컬 Quick Action(FR-007a): 이 기기 기억·회의록 검색. 승인 뒤에만 실행되고, 결과에는 번호만 저장한다.
// 외부 전송·파일 삭제·명령 실행은 없다.
export function searchQuickActions({ memory, meetings }) {
  return {
    'memory-search': {
      description: '이 기기 기억에서 검색어를 찾는다(승인 뒤 실행, 결과는 기억 번호만 저장)',
      kind: 'local.memory.search',
      param: 'q',
      build: (params) => {
        const query = searchQuery(params);
        return {
          title: `기억 검색: ${query}`,
          target: 'local:memory (이 기기 기억)',
          content: { query },
          impact: `이 기기 기억 ${memory.list().length}개에서 찾음. 외부 전송 없음. 결과에는 기억 번호만 남기고 원문은 저장하지 않음`,
        };
      },
    },
    'meeting-search': {
      description: '이 기기 회의 제목·녹취에서 검색어를 찾는다(승인 뒤 실행, 결과는 구간 번호·시간만 저장)',
      kind: 'local.meeting.search',
      param: 'q',
      build: (params) => {
        const query = searchQuery(params);
        return {
          title: `회의록 검색: ${query}`,
          target: 'local:meetings (이 기기 회의·녹취)',
          content: { query },
          impact: `이 기기 회의 ${meetings.list().length}개에서 찾음. 외부 전송 없음. 결과에는 회의·구간 번호와 시간만 남기고 녹취 원문은 저장하지 않음`,
        };
      },
    },
  };
}

export class QuickActions {
  constructor(missionControl, actions = defaultQuickActions()) {
    this.missions = missionControl;
    this.actions = actions;
  }

  list() {
    return Object.entries(this.actions).map(([name, a]) => ({ name, description: a.description, kind: a.kind, param: a.param ?? 'text' }));
  }

  request(name, params = {}) {
    const action = this.actions[name];
    if (!action) throw new AppError('not_found', `Quick Action ${name} 없음`);
    const spec = action.build(params);
    return this.missions.create({ ...spec, kind: action.kind, source: `quick:${name}` });
  }
}
