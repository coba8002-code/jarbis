// 앱 조립: DB와 각 기능을 한 곳에서 만든다. Windows·macOS 공통.
import { join } from 'node:path';
import { AppError } from '../errors.js';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../store/db.js';
import { Settings } from '../store/settings.js';
import { MissionControl } from '../mission/missions.js';
import { defaultExecutors, searchExecutors } from '../mission/executors.js';
import { QuickActions, defaultQuickActions, searchQuickActions } from '../quick/quickActions.js';
import { MemoryStore } from '../memory/memory.js';
import { MeetingStore } from '../meeting/meetings.js';
import { LiveMeetings } from '../meeting/live.js';
import { MeetingSummaries } from '../meeting/summary.js';
import { CharacterStore } from '../character/characters.js';
import { AvatarImages } from '../character/avatar-images.js';
import { ProviderRegistry } from '../providers/registry.js';
import { createMockProvider } from '../providers/mock.js';
import { Conversation, createTransferExecutor, TRANSFER_KIND } from '../conversation/transfer.js';
import { TurnManager } from '../conversation/turns.js';
import { SpeechPlayer } from '../voice/player.js';
import { createSystemSpeaker } from '../voice/system-speaker.js';
import { SpeechToText } from '../voice/stt.js';
import { createAmbientService, localJudgeProvider } from '../voice/ambient-service.js';
import { Briefings } from '../briefing/briefing.js';
import { MemorySuggester } from '../memory/suggest.js';
import { KSkills } from '../skills/kskill.js';
import { GoogleLink } from '../integrations/google.js';
import { Board } from '../board/board.js';
import { Shortcuts } from '../shortcuts/shortcuts.js';
import { createPcRunner } from '../shortcuts/pc-runner.js';
import { acquireDataLock } from './data-lock.js';

const VOICE_KEY = 'voice.enabled';
const FAST_KEY = 'chat.fast';
const AUTO_THINK_KEY = 'chat.autoThink';
const LOW_POWER_KEY = 'power.low';
const PREVIEW_TEXT = '안녕하세요. 이 목소리로 대답할게요.';

// 목소리마다 OS 합성기를 처음 쓸 때 만든다. 지원하지 않는 OS면 그 문장만 실패로 알린다.
function systemSpeakerFactory() {
  const cache = new Map();
  return (voice) => {
    const key = voice ?? '';
    return {
      speak(text) {
        try {
          if (!cache.has(key)) cache.set(key, createSystemSpeaker({ voice: voice ?? undefined }));
        } catch (e) {
          return { done: Promise.reject(e), kill() {} };
        }
        return cache.get(key).speak(text);
      },
      // 기기로 보낼 WAV 만들기(소리 없음). 기기에 음성 엔진이 없을 때 쓰는 PC 음성 대체(/api/tts).
      synthesizeToFile(text, path) {
        try {
          if (!cache.has(key)) cache.set(key, createSystemSpeaker({ voice: voice ?? undefined }));
        } catch (e) {
          return Promise.reject(e);
        }
        return cache.get(key).synthesizeToFile(text, path);
      },
      listVoices() {
        try {
          return createSystemSpeaker().listVoices();
        } catch (e) {
          return Promise.reject(e);
        }
      },
    };
  };
}

// dataDir: DB와 회의 원음을 두는 폴더.
// 검사용으로 바꿔 끼울 수 있는 것: providers, speaker(목소리와 무관한 고정 스피커), speakerFactory(voice → speaker),
// stt(SpeechToText 또는 { launcher, ffmpeg } 설정). 없으면 받아쓰기는 "설정 안 됨"으로 알린다.
// meetingStt: 회의 파일용 받아쓰기(같은 형식). 없으면 stt를 쓴다.
// kskillFetch: k-skill 조회 서버 호출(검사에서 가짜로 바꿈).
// googleFetch·googleUrls: 구글 캘린더·Tasks 호출(검사에서 가짜 서버로 바꿈). pcRunner·shortcutPathCheck: 단축키 판의 PC 조작(검사에서 가짜).
export function createServices({ dataDir, env = process.env, providers, speaker, speakerFactory, stt, meetingStt, recover = true, kskillFetch = globalThis.fetch, googleFetch = globalThis.fetch, googleUrls, pcRunner, shortcutPathCheck }) {
  mkdirSync(dataDir, { recursive: true });
  // 같은 데이터 폴더를 쓰는 다른 JARVIS가 있으면 DB를 열거나 복원하기 전에 멈춘다(src/app/data-lock.js).
  const lock = acquireDataLock(dataDir);
  let db;
  try {
    db = openDb(join(dataDir, 'jarvis.db'));
  } catch (e) {
    lock.release();
    throw e;
  }
  const settings = new Settings(db);
  const registry = providers ?? ProviderRegistry.fromEnv({ env });
  if (!registry.providers.mock) registry.providers.mock = createMockProvider('mock');
  const memory = new MemoryStore(db);
  const characters = new CharacterStore(db, settings);
  // 캐릭터 그림 얼굴: 이 기기 데이터 폴더(avatars/)에만 둔다
  const avatarImages = new AvatarImages(join(dataDir, 'avatars'));
  const audioDir = join(dataDir, 'meetings');
  mkdirSync(audioDir, { recursive: true });
  const meetings = new MeetingStore(db, { audioDir });
  const missions = new MissionControl(db, {
    executors: { ...defaultExecutors(), ...searchExecutors({ memory, meetings }), [TRANSFER_KIND]: createTransferExecutor({ memory, providers: registry }) },
  });

  // 음성 출력: 설정이 없으면 꺼짐. 적용한 캐릭터의 목소리로 읽는다.
  const factory = speaker ? () => speaker : (speakerFactory ?? systemSpeakerFactory());
  const currentSpeaker = { speak: (text) => factory(characters.active()?.voice ?? null).speak(text) };
  const voiceErrors = [];
  let turns;
  const player = new SpeechPlayer({
    speaker: currentSpeaker,
    onEnded: (id) => turns.playbackEnded(id),
    onError: (id, e) => { voiceErrors.push({ turnId: id, code: e.code ?? 'tts_failed', message: e.message }); voiceErrors.splice(0, voiceErrors.length - 20); },
  });
  turns = new TurnManager({ providers: registry, player });
  const voice = {
    get enabled() { return settings.get(VOICE_KEY, false) === true; },
    set enabled(v) { settings.set(VOICE_KEY, v === true); },
    turns,
    errors: voiceErrors,
    // 지금·방금 스피커로 읽은 글(메모리에만, 최근 8문장). 듣기 모드 에코 판단용(T219).
    recentSpoken: (windowMs) => player.recentText(windowMs),
    status: () => {
      const c = characters.active();
      return {
        enabled: voice.enabled,
        state: turns.state,
        character: c ? { id: c.id, name: c.name, voice: c.voice, look: c.look, images: avatarImages.list(c.id) } : null,
        lastError: voiceErrors.at(-1) ?? null,
      };
    },
    listVoices: () => (factory(null).listVoices?.() ?? Promise.resolve([])),
    // PC 음성 대체: 적용한 캐릭터 목소리로 WAV를 만들어 돌려준다(임시 파일은 바로 지움, 저장 안 함).
    async synthesizeWav(text) {
      const sp = factory(characters.active()?.voice ?? null);
      if (typeof sp.synthesizeToFile !== 'function') throw new AppError('tts_unavailable', '이 PC에서는 음성 파일을 만들 수 없음');
      const dir = mkdtempSync(join(tmpdir(), 'jarvis-tts-'));
      try {
        const path = join(dir, 'say.wav');
        await sp.synthesizeToFile(text, path);
        return readFileSync(path);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    // 캐릭터 목소리 미리 듣기: 사용자가 누를 때만 한 문장을 말한다. 끌 때 멈출 수 있게 지금 말하는 것을 기억한다.
    previewing: null,
    async preview(characterId) {
      const c = characters.get(characterId);
      const h = factory(c.voice ?? null).speak(PREVIEW_TEXT);
      voice.previewing = h;
      try {
        const r = await h.done;
        return { id: c.id, voice: c.voice, text: PREVIEW_TEXT, killed: Boolean(r?.killed) };
      } finally {
        if (voice.previewing === h) voice.previewing = null;
      }
    },
  };

  const services = {
    db,
    dataDir,
    settings,
    memory,
    missions,
    characters,
    avatarImages,
    providers: registry,
    voice,
    // 빠른 답(생각 생략) 설정. 기본 켬(2026-11-14 사용자 결정, T097). 사용자가 끄면 그 값이 재시작 후에도 유지된다.
    chatSettings: {
      get fast() { return settings.get(FAST_KEY, true) === true; },
      set fast(v) { settings.set(FAST_KEY, v === true); },
      // 계산·추론 질문 자동 생각함. 기본 켬(2026-11-14 사용자 결정, T224).
      get autoThink() { return settings.get(AUTO_THINK_KEY, true) === true; },
      set autoThink(v) { settings.set(AUTO_THINK_KEY, v === true); },
      // 저전력 모드(아이디어 출처: isair/jarvis): 판정·브리핑·기억 제안 모델을 1분만 메모리에 두고 미리 올리지 않는다. 기본 끔.
      get lowPower() { return settings.get(LOW_POWER_KEY, false) === true; },
      set lowPower(v) { settings.set(LOW_POWER_KEY, v === true); },
    },
    // 빠른 작업: 모의 2개 + 이 기기 기억·회의록 검색(FR-007a)
    quick: new QuickActions(missions, { ...defaultQuickActions(), ...searchQuickActions({ memory, meetings }) }),
    chat: new Conversation({ missions, memory, providers: registry, turns, characters, onExchange: (e) => services.memorySuggest?.record(e) }),
    meetings,
    stt: stt instanceof SpeechToText ? stt : new SpeechToText(stt ?? {}),
    meetingStt: null,
    recovered: { missions: [], meetings: [] },
    // 끄기 첫 단계: 진행 중인 답 생성·소리 읽기·미리 듣기·실행 중 전송 미션·받아쓰기(whisper 자식 프로세스)를 끊는다.
    // DB는 아직 닫지 않는다(끊긴 요청이 응답과 상태 기록을 마친 뒤 shutdown.js가 닫음).
    cancelAll: () => {
      turns.cancel();
      services.chat.stopAll();
      missions.abortAll();
      voice.previewing?.kill();
      services.stt.close();
      if (services.meetingStt !== services.stt) services.meetingStt.close();
    },
    close: () => { services.google?.close(); services.briefings?.stop(); services.memorySuggest?.stop(); turns.cancel(); services.stt.close(); if (services.meetingStt !== services.stt) services.meetingStt.close(); db.close(); lock.release(); },
  };
  // 회의 파일 받아쓰기(VAD 없는 엔진). 따로 주지 않으면 일반 받아쓰기를 같이 쓴다.
  services.meetingStt = meetingStt ? (meetingStt instanceof SpeechToText ? meetingStt : new SpeechToText(meetingStt)) : services.stt;
  // 주변 대화 듣기(부르면 대답하기): 기본 꺼짐, 동의해야 켬, 들은 말은 메모리에만 2분.
  // 보조 모델 정책: 짧은 판단(판정·사실 뽑기)은 JARVIS_OLLAMA_FAST_MODEL(있으면, 작은 모델)로, 저전력이면 1분만 메모리에.
  const modelPolicy = () => ({ keepAlive: services.chatSettings.lowPower ? '1m' : '30m', fastModel: env.JARVIS_OLLAMA_FAST_MODEL || null, lowPower: services.chatSettings.lowPower });
  services.modelPolicy = modelPolicy;
  services.ambient = createAmbientService({ stt: services.stt, providers: registry, characters, policy: modelPolicy });
  // 기억 제안: 대화가 5분 멈추면 이 기기 안 모델이 오래 갈 사실만 뽑아 "기억할까요?"로 둔다(저장은 사용자가 고른 것만).
  services.memorySuggest = new MemorySuggester({ memory, providers: registry, localProvider: () => localJudgeProvider(registry), policy: modelPolicy });
  // k-skill 조회 스킬(vendor/k-skill): 스킬마다 한 번 동의해야 쓴다. 대화(이 기기 안 공급자)와 아침 브리핑 날씨에 쓴다.
  services.kskills = new KSkills({ settings, providers: registry, localProvider: () => localJudgeProvider(registry), policy: modelPolicy, env, fetchImpl: kskillFetch });
  services.chat.skills = services.kskills;
  // 구글 캘린더·Tasks(2026-11-15): 사용자가 직접 로그인해야 쓴다. 열쇠는 데이터 폴더에만.
  services.google = new GoogleLink({ dataDir, env, fetchImpl: googleFetch, ...(googleUrls ? { urls: googleUrls } : {}) });
  // 대기화면 자료(2026-11-15): 날씨(k-skill)·오늘 중요한 일·해야 할 일(구글, 나중에 ax.designjux.com)
  services.board = new Board({ settings, kskills: services.kskills, google: services.google });
  // 단축키 판(2026-11-15): 메인 화면 버튼. PC 조작은 이 PC 화면에서만 만들 수 있다.
  services.shortcuts = new Shortcuts({ settings, runner: pcRunner ?? createPcRunner(), ...(shortcutPathCheck ? { pathCheck: shortcutPathCheck } : {}) });
  // 아침 브리핑: 이 기기 안 자료로 이 기기 안 모델이 미리 쓴다(시작은 main.js에서 start()). 구글이 연결돼 있으면 오늘 일정·할 일도 넣는다.
  services.briefings = new Briefings({ db, settings, missions, meetings: services.meetings, providers: registry, characters, localProvider: () => localJudgeProvider(registry), policy: modelPolicy, weather: () => services.kskills.briefingWeather(), agenda: () => services.google.briefingAgenda() });
  // 회의 의견·결론 정리(2026-11-15): 녹취를 이 기기 안 모델에만 보내 정리한다(클라우드로 보내지 않음).
  services.meetingSummaries = new MeetingSummaries({ db, meetings: services.meetings, providers: registry, localProvider: () => localJudgeProvider(registry), policy: modelPolicy });
  // 회의 마이크 녹음(T123): 조각을 원음 뒤에 붙이고 회의용 엔진으로 받아 적는다.
  services.liveMeetings = new LiveMeetings(services.meetings, services.meetingStt);
  // 앱 시작 때 한 번: 실행·녹음 도중 꺼진 것을 중단으로 표시한다(자동 재실행 없음).
  if (recover) {
    services.recovered = {
      missions: missions.recoverInterrupted(),
      meetings: services.meetings.recoverInterrupted(),
    };
    // 녹음 중 꺼진 회의의 원음은 머리글 크기를 맞춰 재생할 수 있게 한다.
    services.liveMeetings.repair(services.recovered.meetings);
  }
  return services;
}
