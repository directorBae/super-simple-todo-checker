const test = require('node:test');
const assert = require('node:assert/strict');
const { focusAssistant } = require('../lib/focus-assistant');
const config = { openaiKey: 'test-secret', openaiModel: 'test-model' };
function mock(t, result, status = 'completed') {
  t.mock.method(global, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body); assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(body.store, false); assert.equal(body.text.format.strict, true); assert.ok(!body.input.includes(config.openaiKey));
    return new Response(JSON.stringify({ status, output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }), { status: 200 });
  });
}
test('assistant requires a configured key and bounded input', async () => {
  await assert.rejects(focusAssistant('compress-title', '할 일', {}), /OPENAI_API_KEY/);
  await assert.rejects(focusAssistant('compress-title', 'a'.repeat(10001), config), /10,000/);
});
test('compression returns a structured short Korean title', async t => {
  mock(t, { title: '금요일까지 예산안 검토' });
  assert.deepEqual(await focusAssistant('compress-title', '이번 금요일까지 예산안을 검토해 주세요', config), { ok: true, title: '금요일까지 예산안 검토' });
});
test('invalid or overlong model responses never silently replace task titles', async t => {
  mock(t, { title: '가'.repeat(51) }); await assert.rejects(focusAssistant('compress-title', '제안서 정리', config), /길이/);
});
test('pet generation is constrained to available rendered species and colors', async t => {
  const pet = { name: '모모', species: 'cat', color: 'mint', personality: '차분한 친구', greeting: '하나씩 해 보자' }; mock(t, pet);
  assert.deepEqual(await focusAssistant('create-pet', '차분한 민트 고양이', config), { ok: true, ...pet });
});
test('unfinished responses fail without modifying anything', async t => {
  mock(t, { title: '할 일' }, 'incomplete'); await assert.rejects(focusAssistant('compress-title', '제안서 정리', config), /완료되지/);
});
