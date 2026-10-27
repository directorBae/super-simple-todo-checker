// Puts the per-person tool connections live on Supabase, in one go (safe to run again):
//   1. tables, policies and the push-back trigger (supabase/integrations.sql, with pg_cron/pg_net)
//   2. the function's secrets (Google/Notion/OpenAI keys from server/.env, plus two generated secrets)
//   3. the `integrations` Edge Function
// Needs in server/.env: SUPABASE_URL, SUPABASE_KEY (secret key), SUPABASE_ACCESS_TOKEN (dashboard → Account → Access Tokens),
// OPENAI_API_KEY, GOOGLE_CLIENT_ID/SECRET, NOTION_CLIENT_ID/SECRET (Notion may be filled in later — run again).
//   node supabase/deploy.cjs                 deploy
//   node supabase/deploy.cjs --notion-token  show the Notion webhook verification token (after Notion sent it)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..'), envFile = path.join(root, 'server', '.env');
process.loadEnvFile(envFile);
const env = process.env, ref = new URL(env.SUPABASE_URL).hostname.split('.')[0];
const fnUrl = `${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/integrations`;
if (!env.SUPABASE_ACCESS_TOKEN) { console.error('server/.env에 SUPABASE_ACCESS_TOKEN이 필요해요.'); process.exit(1); }

async function api(pathname, body) {
  const res = await fetch('https://api.supabase.com/v1/projects/' + ref + pathname, { method: 'POST', headers: { Authorization: 'Bearer ' + env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const sql = (query) => api('/database/query', { query });
const literal = (v) => "'" + String(v).replace(/'/g, "''") + "'";

// Two secrets of our own, kept in server/.env so later runs keep the same values.
function secret(name) {
  if (env[name]) return env[name];
  const value = crypto.randomBytes(32).toString('base64url');
  fs.appendFileSync(envFile, `\n${name}=${value}\n`);
  env[name] = value;
  return value;
}

async function main() {
  if (process.argv.includes('--notion-token')) {
    const rows = await sql("select token from public.webhook_keys where provider = 'notion'");
    console.log(rows?.[0]?.token ? '노션 확인 토큰: ' + rows[0].token : '아직 노션이 확인 토큰을 보내지 않았어요. 노션에서 웹훅 주소를 저장한 뒤 다시 실행해 주세요.');
    return;
  }
  const stateSecret = secret('INTEGRATIONS_STATE_SECRET'), hookSecret = secret('INTEGRATIONS_HOOK_SECRET');

  console.log('1/3 표와 트리거 …');
  await sql('create extension if not exists pg_cron; create extension if not exists pg_net;');
  await sql(fs.readFileSync(path.join(__dirname, 'integrations.sql'), 'utf8'));
  await sql(`insert into public.function_settings (key, value) values ('functions_url', ${literal(fnUrl)}), ('hook_secret', ${literal(hookSecret)})
    on conflict (key) do update set value = excluded.value;`);
  await sql(fs.readFileSync(path.join(__dirname, 'integrations.sql'), 'utf8')); // again, now that pg_cron exists for the renewal job

  console.log('2/3 함수 비밀값 …');
  const secrets = {
    SB_SECRET_KEY: env.SUPABASE_KEY, OPENAI_API_KEY: env.OPENAI_API_KEY, OPENAI_MODEL: env.INTEGRATIONS_MODEL || 'gpt-6.1-terra',
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    NOTION_CLIENT_ID: env.NOTION_CLIENT_ID, NOTION_CLIENT_SECRET: env.NOTION_CLIENT_SECRET,
    STATE_SECRET: stateSecret, HOOK_SECRET: hookSecret, TIME_ZONE: env.TIME_ZONE || 'Asia/Seoul',
  };
  const list = Object.entries(secrets).filter(([, v]) => v).map(([name, value]) => ({ name, value }));
  await api('/secrets', list);
  const missing = Object.entries(secrets).filter(([, v]) => !v).map(([k]) => k);

  console.log('3/3 함수 배포 …');
  const r = spawnSync(`npx --yes supabase@2 functions deploy integrations --project-ref ${ref} --use-api`, { cwd: root, stdio: 'inherit', shell: true, env });
  if (r.status !== 0) throw new Error('함수 배포에 실패했어요(위 메시지 참고).');

  console.log(`\n끝났어요. 함수 주소: ${fnUrl}`);
  console.log(`구글 리디렉션 URI:  ${fnUrl}/oauth/callback/google`);
  console.log(`노션 리디렉션 URI:  ${fnUrl}/oauth/callback/notion`);
  console.log(`노션 웹훅 주소:     ${fnUrl}/webhook/notion`);
  if (missing.length) console.log('아직 비어 있는 값: ' + missing.join(', ') + ' — server/.env에 넣고 다시 실행하면 돼요.');
}
main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
