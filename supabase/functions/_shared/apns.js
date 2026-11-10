// VoIP pushes straight to Apple (APNs over HTTP/2): the phone's CallKit rings like a phone call, even with the app
// closed. Expo's push service cannot send these. Needs APNS_KEY (the .p8 from developer.apple.com → Keys → APNs),
// APNS_KEY_ID and APNS_TEAM_ID; the topic is the bundle id + ".voip" (APNS_TOPIC). TestFlight and App Store builds
// use the production server; APNS_SANDBOX=1 switches to the sandbox for development builds.
const HOST = 'https://api.push.apple.com', SANDBOX = 'https://api.sandbox.push.apple.com';
export const DEFAULT_TOPIC = 'com.todochecker.app.voip';

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64json = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));

export const apnsReady = (env) => !!(env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID);

// The provider token: an ES256 JWT signed with the .p8, good for an hour (Apple refuses one older than that, and
// one refreshed more often than every 20 minutes), so it is kept for 50 minutes.
let cached = null;
export async function providerToken(env) {
  const now = Math.floor(env.now() / 1000);
  if (cached && cached.kid === env.APNS_KEY_ID && now - cached.at < 50 * 60) return cached.jwt;
  const pem = String(env.APNS_KEY).replace(/\\n/g, '\n');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const body = `${b64json({ alg: 'ES256', kid: env.APNS_KEY_ID })}.${b64json({ iss: env.APNS_TEAM_ID, iat: now })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(body)));
  cached = { jwt: `${body}.${b64url(sig)}`, at: now, kid: env.APNS_KEY_ID };
  return cached.jwt;
}

// One VoIP push to one phone. {ok, status, reason} — reason is Apple's word for a refusal (BadDeviceToken,
// Unregistered (410), InvalidProviderToken, TopicDisallowed, …).
export async function voipPush(env, token, payload) {
  let jwt;
  try { jwt = await providerToken(env); }
  catch (e) { return { ok: false, status: 0, reason: 'BadKey: ' + (e.message || e) }; }
  const res = await env.fetch(`${env.APNS_SANDBOX ? SANDBOX : HOST}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: 'bearer ' + jwt, 'apns-topic': env.APNS_TOPIC || DEFAULT_TOPIC, 'apns-push-type': 'voip',
      'apns-priority': '10', 'apns-expiration': String(Math.floor(env.now() / 1000) + 30), 'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).catch((e) => ({ ok: false, status: 0, text: async () => e.message || String(e) }));
  const text = await res.text().catch(() => '');
  let reason = null;
  try { reason = JSON.parse(text).reason || null; } catch { /* not JSON */ }
  return { ok: !!res.ok, status: res.status, reason: reason || (res.ok ? null : text.slice(0, 120) || null) };
}
