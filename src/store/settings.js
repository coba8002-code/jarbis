// 앱 설정(키-값). 재시작 후에도 남는다. 값은 JSON으로 저장.
export class Settings {
  constructor(db) {
    this.db = db;
  }

  get(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  }

  set(key, value) {
    if (value === null || value === undefined) {
      this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    } else {
      this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key, JSON.stringify(value));
    }
    return value ?? null;
  }
}
