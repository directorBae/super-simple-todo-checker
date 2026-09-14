const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

// One personal server, independent clients. This is not multi-user registration.
function createLogin(dir, configuredPassword) {
  const passwordFile = path.join(dir, 'login-password.txt');
  if (!configuredPassword && !fs.existsSync(passwordFile)) {
    fs.writeFileSync(passwordFile, crypto.randomBytes(18).toString('base64url') + '\n', { mode: 0o600, flag: 'wx' });
  }
  const password = configuredPassword || fs.readFileSync(passwordFile, 'utf8').trim();
  if (password.length < 12 || password.length > 256) throw new Error('PERSONAL_PASSWORD must contain 12 to 256 characters.');
  const salt = crypto.randomBytes(16), expected = crypto.scryptSync(password, salt, 32);
  const attempts = new Map();
  let running = 0;
  return {
    async verify(value, ip) {
      const now = Date.now();
      for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
      const entry = attempts.get(ip) || { count: 0, until: now + 600000 };
      if (entry.count >= 10 || running >= 4) return { ok: false, status: 429, error: '잠시 후 다시 로그인해 주세요.' };
      attempts.set(ip, entry); entry.count++;
      if (typeof value !== 'string' || value.length > 256) return { ok: false, status: 401, error: '서버 비밀번호를 확인해 주세요.' };
      running++;
      try {
        const actual = await scrypt(value, salt, 32);
        if (!crypto.timingSafeEqual(expected, actual)) return { ok: false, status: 401, error: '서버 비밀번호를 확인해 주세요.' };
        attempts.delete(ip);
        return { ok: true };
      } finally { running--; }
    },
    passwordFile: configuredPassword ? null : passwordFile,
  };
}
module.exports = { createLogin };
