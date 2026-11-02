// Bakes the Supabase settings (desktop/.env, else supabase.public.json) into electron/supabase.json for packaged
// builds (that file is git-ignored).
const fs = require('node:fs');
const path = require('node:path');
const env = path.join(__dirname, '..', '.env');
if (fs.existsSync(env)) process.loadEnvFile(env);
// Without a .env (a fresh clone, another Mac, GitHub Actions) the public settings in supabase.public.json are used:
// the project URL and its publishable key, the same ones every client ships with.
let { SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey } = process.env;
if (!url || !anonKey) { try { ({ url, anonKey } = require('../supabase.public.json')); } catch {} }
const out = path.join(__dirname, '..', 'electron', 'supabase.json');
if (url && anonKey) { fs.writeFileSync(out, JSON.stringify({ url, anonKey }, null, 2)); console.log('Supabase 설정을 앱에 포함했습니다.'); }
else console.log('SUPABASE_URL/SUPABASE_ANON_KEY가 없어 Supabase 없이 빌드합니다.');
