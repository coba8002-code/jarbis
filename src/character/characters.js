// 캐릭터 설정 (US4, 기기 없는 부분). 원본 확인 전 잠정.
// - 이름, 성격·말투(persona), 목소리 이름(OS 음성), 자산 목록(이름·출처·이용 조건 필수).
// - 적용(활성) 캐릭터는 설정에 저장돼 재시작 후에도 유지된다.
// - 비밀 키처럼 보이는 값은 저장하지 않는다.
import { AppError } from '../errors.js';
import { nowIso, scrub } from '../store/db.js';
import { looksLikeSecret } from '../security/secrets.js';
import { SHAPES, EYES, DEFAULT_LOOK } from '../server/public/avatar.js';

const ACTIVE_KEY = 'character.active';

function text(name, v, max) {
  if (typeof v !== 'string' || v.trim() === '') throw new AppError('invalid_input', `${name}이(가) 비어 있음`);
  if (v.length > max) throw new AppError('invalid_input', `${name}은(는) ${max}자 이하`);
  if (looksLikeSecret(v)) throw new AppError('rejected_secret', `${name}에 비밀 키처럼 보이는 값이 있음`);
  return v.trim();
}

function assetsOf(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new AppError('invalid_input', '자산은 목록이어야 함');
  return list.map((a, i) => ({
    name: text(`자산 ${i + 1} 이름`, a?.name, 100),
    source: text(`자산 ${i + 1} 출처`, a?.source, 300),
    license: text(`자산 ${i + 1} 이용 조건`, a?.license, 300),
  }));
}

function voiceOf(v) {
  if (v === undefined || v === null || v === '') return null;
  return text('목소리', v, 100);
}

// 얼굴(FR-003a, 잠정): 모양·색·눈. 없으면 기본 얼굴. 목록에 없는 값·#RRGGBB가 아닌 색은 거부한다.
function lookOf(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw new AppError('invalid_input', '얼굴은 {shape, color, eyes} 객체여야 함');
  if (!SHAPES.includes(v.shape)) throw new AppError('invalid_input', `얼굴 모양은 ${SHAPES.join('·')} 중 하나`);
  if (typeof v.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.color)) throw new AppError('invalid_input', '얼굴 색은 #RRGGBB');
  if (!EYES.includes(v.eyes)) throw new AppError('invalid_input', `눈은 ${EYES.join('·')} 중 하나`);
  return { shape: v.shape, color: v.color.toLowerCase(), eyes: v.eyes };
}

function toCharacter(row) {
  const { look, ...rest } = row;
  return { ...rest, assets: JSON.parse(row.assets), look: look ? JSON.parse(look) : { ...DEFAULT_LOOK } };
}

export class CharacterStore {
  constructor(db, settings) {
    this.db = db;
    this.settings = settings;
  }

  create({ name, persona, voice, assets, look }) {
    const at = nowIso();
    const face = lookOf(look);
    const res = this.db.prepare(
      'INSERT INTO characters (name, persona, voice, assets, look, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(text('이름', name, 50), text('성격·말투', persona, 2000), voiceOf(voice), JSON.stringify(assetsOf(assets)), face ? JSON.stringify(face) : null, at, at);
    return this.get(Number(res.lastInsertRowid));
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    if (!row) throw new AppError('not_found', `캐릭터 ${id} 없음`);
    return toCharacter(row);
  }

  list() {
    const active = this.settings.get(ACTIVE_KEY);
    return this.db.prepare('SELECT * FROM characters ORDER BY id').all()
      .map((r) => ({ ...toCharacter(r), active: r.id === active }));
  }

  update(id, changes = {}) {
    const cur = this.get(id);
    const next = {
      name: changes.name === undefined ? cur.name : text('이름', changes.name, 50),
      persona: changes.persona === undefined ? cur.persona : text('성격·말투', changes.persona, 2000),
      voice: changes.voice === undefined ? cur.voice : voiceOf(changes.voice),
      assets: changes.assets === undefined ? cur.assets : assetsOf(changes.assets),
      look: changes.look === undefined ? cur.look : (lookOf(changes.look) ?? { ...DEFAULT_LOOK }),
    };
    this.db.prepare('UPDATE characters SET name = ?, persona = ?, voice = ?, assets = ?, look = ?, updated_at = ? WHERE id = ?')
      .run(next.name, next.persona, next.voice, JSON.stringify(next.assets), JSON.stringify(next.look), nowIso(), id);
    scrub(this.db);
    return this.get(id);
  }

  delete(id) {
    this.get(id);
    if (this.settings.get(ACTIVE_KEY) === id) this.settings.set(ACTIVE_KEY, null);
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id);
    scrub(this.db);
    return { id, deleted: true };
  }

  // 적용. null이면 기본(캐릭터 없음)으로 돌아간다.
  setActive(id) {
    if (id !== null) this.get(id);
    this.settings.set(ACTIVE_KEY, id);
    return this.active();
  }

  active() {
    const id = this.settings.get(ACTIVE_KEY);
    if (id === null) return null;
    try {
      return this.get(id);
    } catch {
      this.settings.set(ACTIVE_KEY, null);
      return null;
    }
  }
}
