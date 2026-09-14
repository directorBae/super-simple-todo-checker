const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

class Storage {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.sql = new DatabaseSync(path.join(dir, 'state.sqlite'));
    this.sql.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    const row = this.sql.prepare('SELECT data FROM state WHERE id=1').get();
    let initial = {};
    if (row) initial = JSON.parse(row.data);
    else if (fs.existsSync(path.join(dir, 'db.json'))) initial = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
    this.data = { teams: [], projects: [], todos: [], tombstones: [], connections: [], targets: [], links: [], jobs: [], oauth: [], duplicateMemories: [], todoAliases: {}, ...initial };
    for (const t of this.data.todos) { t.origin ||= { type: 'legacy' }; t.revision ||= 1; t.kind = 'todo'; delete t.channel; }
    for (const j of this.data.jobs) if (j.state === 'running') j.state = 'uncertain';
    const keyPath = path.join(dir, 'credentials.key');
    if (process.env.CREDENTIAL_KEY) this.key = Buffer.from(process.env.CREDENTIAL_KEY, 'base64');
    else {
      if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' });
      this.key = fs.readFileSync(keyPath);
    }
    if (this.key.length !== 32) throw new Error('CREDENTIAL_KEY must be 32 bytes encoded as base64');
    this.save();
  }
  save() { this.sql.prepare('INSERT INTO state VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(this.data)); }
  seal(value) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }
  unseal(value) {
    const b = Buffer.from(value, 'base64'), decipher = crypto.createDecipheriv('aes-256-gcm', this.key, b.subarray(0, 12));
    decipher.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString());
  }
  close() { this.sql.close(); }
}
module.exports = { Storage };
