// 캐릭터 그림 얼굴(2026-11-14 사용자 요청). 사용자가 직접 넣은 그림을 상태별로 보여 준다.
// - 상태: 대기(idle)·듣는 중(listening)·생각 중(thinking)·말하는 중(speaking, speaking2를 번갈아 보여 입이 움직이게).
// - 그림은 이 기기 데이터 폴더(avatars/<캐릭터 번호>/<상태>.<확장자>)에만 둔다. 어디에도 보내지 않는다.
// - 파일 내용의 앞부분(시그니처)으로 PNG·JPEG·GIF·WebP만 받는다(확장자·머리글을 믿지 않음). 한 장 최대 5MB.
// - 쓸 권리가 있는 그림만 넣도록 화면에서 안내하고, 출처·이용 조건은 캐릭터 자산 기록에 남긴다.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../errors.js';

export const IMAGE_STATES = ['idle', 'listening', 'thinking', 'speaking', 'speaking2'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

// 파일 앞부분으로 그림 형식을 알아낸다. 모르는 형식이면 null.
export function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('latin1', 0, 6) === 'GIF87a' || buf.toString('latin1', 0, 6) === 'GIF89a') return 'gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function checkState(state) {
  if (!IMAGE_STATES.includes(state)) throw new AppError('invalid_input', `그림 상태는 ${IMAGE_STATES.join('·')} 중 하나`);
}

function checkId(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError('invalid_input', `잘못된 캐릭터 번호: ${id}`);
}

export class AvatarImages {
  constructor(dir) {
    this.dir = dir;
  }

  #folder(id) {
    checkId(id);
    return join(this.dir, String(id));
  }

  // 그 상태의 파일 이름(확장자 포함). 없으면 null.
  #file(id, state) {
    let names;
    try { names = readdirSync(this.#folder(id)); } catch { return null; }
    return names.find((n) => n.slice(0, n.lastIndexOf('.')) === state) ?? null;
  }

  // 들어 있는 상태와 바뀐 시각(화면이 새 그림을 다시 받게 하는 표시)
  list(id) {
    let names;
    try { names = readdirSync(this.#folder(id)); } catch { return []; }
    return IMAGE_STATES.flatMap((state) => {
      const n = names.find((x) => x.slice(0, x.lastIndexOf('.')) === state);
      return n ? [{ state, v: Math.round(statSync(join(this.#folder(id), n)).mtimeMs) }] : [];
    });
  }

  save(id, state, buf) {
    checkState(state);
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw new AppError('invalid_input', '그림이 비어 있음');
    if (buf.length > MAX_IMAGE_BYTES) throw new AppError('payload_too_large', `그림은 한 장 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 이하`);
    const ext = sniffImage(buf);
    if (!ext) throw new AppError('invalid_input', '그림은 PNG·JPEG·GIF·WebP만 넣을 수 있음');
    const folder = this.#folder(id);
    mkdirSync(folder, { recursive: true });
    const old = this.#file(id, state);
    // 다 쓴 뒤에 이름을 바꿔, 쓰다 끊겨도 반쪽 그림이 남지 않게 한다
    const tmp = join(folder, `.${state}.${process.pid}.tmp`);
    writeFileSync(tmp, buf);
    if (old && old !== `${state}.${ext}`) rmSync(join(folder, old), { force: true });
    renameSync(tmp, join(folder, `${state}.${ext}`));
    return { id, state, type: TYPES[ext], bytes: buf.length, images: this.list(id) };
  }

  read(id, state) {
    checkState(state);
    const name = this.#file(id, state);
    if (!name) throw new AppError('not_found', `캐릭터 ${id}의 ${state} 그림 없음`);
    const ext = name.slice(name.lastIndexOf('.') + 1);
    return { buf: readFileSync(join(this.#folder(id), name)), type: TYPES[ext] ?? 'application/octet-stream' };
  }

  remove(id, state) {
    checkState(state);
    const name = this.#file(id, state);
    if (name) rmSync(join(this.#folder(id), name), { force: true });
    return { id, state, removed: Boolean(name), images: this.list(id) };
  }

  // 캐릭터를 지우면 그 그림 폴더도 지운다
  removeAll(id) {
    rmSync(this.#folder(id), { recursive: true, force: true });
  }
}
