const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

function lanUrls(port) {
  return Object.values(os.networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.')).map(n => `http://${n.address}:${port}`);
}
function publishLocalConnection(token, port) {
  const folder = path.join(process.env.LOCALAPPDATA || os.homedir(), 'todo-checker');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'server.json'), JSON.stringify({ url: `http://127.0.0.1:${port}`, token, lanUrls: lanUrls(port) }), { mode: 0o600 });
}
function createPairing() {
  let invitation = null;
  const attempts = new Map();
  return {
    issue(port) {
      invitation = { code: String(crypto.randomInt(100000, 1000000)), expiresAt: Date.now() + 600000 };
      return { ...invitation, urls: lanUrls(port) };
    },
    redeem(code, ip) {
      const now = Date.now(), old = attempts.get(ip);
      const entry = old && old.until > now ? old : { count: 0, until: now + 600000 };
      attempts.set(ip, entry);
      if (++entry.count > 10) return false;
      if (!invitation || invitation.expiresAt < now || String(code) !== invitation.code) return false;
      invitation = null; attempts.delete(ip);
      return true;
    },
  };
}
module.exports = { createPairing, publishLocalConnection, lanUrls };
