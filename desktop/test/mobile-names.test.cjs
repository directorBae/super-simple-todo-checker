// 폰 앱 코드에 선언되지 않은 이름이 없는지 — 1.5.0 폰 앱이 켜자마자 죽은 사고(2026-11-27): Board.js가 Animated를
// import하지 않고 썼다. 번들(expo export)은 이런 걸 못 잡고(실행하지 않으니까), 폰 화면 점검은 기기 없이 못 돌린다.
// 그래서 mobile/의 JS를 모두 파싱해, 어디에도 선언되지 않았고 JS·React Native 전역도 아닌 이름을 찾는다.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path'), fs = require('node:fs');

const mobile = path.resolve(__dirname, '../../mobile');
const req = (m) => require(require.resolve(m, { paths: [mobile] }));
const { parse } = req('@babel/parser');
const traverse = req('@babel/traverse').default;

// What a React Native (Hermes) app has without importing anything.
const GLOBALS = new Set(`
  globalThis global window self undefined NaN Infinity arguments console process require module exports __dirname __DEV__
  Object Array String Number Boolean Symbol BigInt Function Math JSON Date RegExp Error TypeError RangeError SyntaxError
  ReferenceError EvalError URIError AggregateError Promise Map Set WeakMap WeakSet WeakRef FinalizationRegistry Proxy Reflect
  Intl ArrayBuffer SharedArrayBuffer DataView Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array
  Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array Atomics
  parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape
  setTimeout clearTimeout setInterval clearInterval setImmediate clearImmediate queueMicrotask
  requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback
  fetch Headers Request Response FormData Blob File FileReader URL URLSearchParams AbortController AbortSignal
  WebSocket XMLHttpRequest TextEncoder TextDecoder atob btoa structuredClone performance navigator alert
  Event EventTarget crypto HermesInternal
`.split(/\s+/).filter(Boolean));

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-check', 'dist-check-ios', 'ios', 'android', '.expo', 'test'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(js|jsx|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

function undeclared(file) {
  const code = fs.readFileSync(file, 'utf8');
  const ast = parse(code, { sourceType: 'unambiguous', plugins: ['jsx'], errorRecovery: false });
  const found = new Map();
  traverse(ast, {
    Program(p) {
      for (const name of Object.keys(p.scope.globals)) {
        if (GLOBALS.has(name)) continue;
        const n = p.scope.globals[name];
        found.set(name, n.loc ? n.loc.start.line : '?');
      }
    },
  });
  return [...found].map(([name, line]) => `${path.relative(mobile, file).replace(/\\/g, '/')}:${line} ${name}`);
}

test('폰 앱: 선언되지 않은 이름이 없다 (import 빠뜨림 → 켜자마자 죽음)', () => {
  const list = files(mobile);
  assert.ok(list.some((f) => f.endsWith(path.join('screens', 'Board.js'))), '폰 앱 화면 파일을 찾지 못함');
  const bad = list.flatMap(undeclared);
  assert.deepStrictEqual(bad, [], '선언·import되지 않은 이름:\n' + bad.join('\n'));
});

test('검사가 실제로 잡는다: import 없이 쓴 Animated', () => {
  const tmp = path.join(require('node:os').tmpdir(), `names-probe-${process.pid}.js`);
  fs.writeFileSync(tmp, "import { View } from 'react-native';\nexport default () => { const a = new Animated.Value(0); return <View><Animated.View/></View>; };\n");
  try { assert.deepStrictEqual(undeclared(tmp).map((x) => x.split(' ').pop()), ['Animated']); } finally { fs.unlinkSync(tmp); }
});
