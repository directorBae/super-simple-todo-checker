// VoIP pushes to Apple (supabase/functions/_shared/apns.js): the provider token is an ES256 JWT Apple can verify, the
// request is the one APNs expects for a VoIP push, and Apple's refusals come back as plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apnsReady, providerToken, voipPush, DEFAULT_TOPIC } from '../../supabase/functions/_shared/apns.js';

const NOW = Date.parse('2026-11-08T09:00:00+09:00');
const pem = (der) => `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
async function keys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { pem: pem(await crypto.subtle.exportKey('pkcs8', pair.privateKey)), publicKey: pair.publicKey };
}
const b64 = (s) => Buffer.from(s, 'base64url');

test('apns: the provider token is an ES256 JWT (kid, iss, iat) that verifies with the key; .p8 with escaped newlines works too', async () => {
  const { pem, publicKey } = await keys();
  const env = { APNS_KEY: pem.replace(/\n/g, '\\n'), APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM42', now: () => NOW };
  assert.equal(apnsReady(env), true); assert.equal(apnsReady({ ...env, APNS_KEY: '' }), false);
  const jwt = await providerToken(env), [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(b64(h)), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(b64(p)), { iss: 'TEAM42', iat: Math.floor(NOW / 1000) });
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, b64(s), Buffer.from(`${h}.${p}`)), 'signature verifies');
  // Kept for 50 minutes, then a new one.
  assert.equal(await providerToken({ ...env, now: () => NOW + 49 * 60_000 }), jwt);
  assert.notEqual(await providerToken({ ...env, now: () => NOW + 51 * 60_000 }), jwt);
});

test('apns: a VoIP push is a POST to /3/device/<token> with the voip topic and headers; refusals come back as words', async () => {
  const { pem } = await keys();
  const calls = [];
  let answer = { status: 200, body: '' };
  const fetch = async (url, init) => { calls.push({ url, init }); return { ok: answer.status < 400, status: answer.status, text: async () => answer.body }; };
  const env = { APNS_KEY: pem, APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', now: () => NOW, fetch };
  const ok = await voipPush(env, 'abc123', { dive: 'd1', caller: '민지' });
  assert.deepEqual(ok, { ok: true, status: 200, reason: null });
  assert.equal(calls[0].url, 'https://api.push.apple.com/3/device/abc123');
  const h = calls[0].init.headers;
  assert.equal(h['apns-topic'], DEFAULT_TOPIC); assert.equal(h['apns-push-type'], 'voip'); assert.equal(h['apns-priority'], '10');
  assert.match(h.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { dive: 'd1', caller: '민지' });
  // The sandbox server for development builds, and a topic of one's own.
  await voipPush({ ...env, APNS_SANDBOX: '1', APNS_TOPIC: 'com.x.app.voip' }, 't', {});
  assert.equal(calls[1].url, 'https://api.sandbox.push.apple.com/3/device/t'); assert.equal(calls[1].init.headers['apns-topic'], 'com.x.app.voip');
  answer = { status: 410, body: '{"reason":"Unregistered"}' };
  assert.deepEqual(await voipPush(env, 'dead', {}), { ok: false, status: 410, reason: 'Unregistered' });
  answer = { status: 403, body: '{"reason":"InvalidProviderToken"}' };
  assert.equal((await voipPush(env, 'x', {})).reason, 'InvalidProviderToken');
  // A key that is not a key: no request, a reason that says so.
  const bad = await voipPush({ ...env, APNS_KEY: 'nonsense', APNS_KEY_ID: 'K2' }, 'x', {});
  assert.equal(bad.ok, false); assert.match(bad.reason, /^BadKey/);
  assert.equal(calls.length, 4);
});
