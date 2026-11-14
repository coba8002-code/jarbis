// 조각으로 오는 답을 말하기 좋은 문장 단위로 모은다.
// 문장 끝(. ! ? 。 줄바꿈) 또는 너무 길어지면(maxLen) 내보낸다.
const END = /[.!?。…\n]/;

export class SentenceBuffer {
  constructor({ maxLen = 120 } = {}) {
    this.buf = '';
    this.maxLen = maxLen;
  }

  push(text) {
    this.buf += text;
    const out = [];
    for (;;) {
      let cut = -1;
      for (let i = 0; i < this.buf.length; i += 1) {
        // "3.5" 같은 숫자 안의 점은 문장 끝으로 보지 않는다.
        if (END.test(this.buf[i]) && !(this.buf[i] === '.' && /\d/.test(this.buf[i - 1] ?? '') && /\d/.test(this.buf[i + 1] ?? ''))) {
          // 끝 문장부호가 이어지면 함께 묶는다. 다음 글자를 아직 모르면(버퍼 끝) 기다린다.
          let j = i;
          while (j + 1 < this.buf.length && END.test(this.buf[j + 1])) j += 1;
          if (j + 1 >= this.buf.length && this.buf[i] === '.') break;
          cut = j + 1;
          break;
        }
      }
      if (cut < 0 && this.buf.length >= this.maxLen) {
        const space = this.buf.lastIndexOf(' ', this.maxLen);
        cut = space > 0 ? space + 1 : this.maxLen;
      }
      if (cut < 0) break;
      const sentence = this.buf.slice(0, cut).trim();
      this.buf = this.buf.slice(cut);
      if (sentence) out.push(sentence);
    }
    return out;
  }

  flush() {
    const rest = this.buf.trim();
    this.buf = '';
    return rest ? [rest] : [];
  }
}
