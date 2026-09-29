import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, transcribe } from '../server/ai.mjs';
const config = { demo: false, key: 'test-only-not-real', model: 'test-model', transcribeModel: 'test-transcribe' };
const store = { status: () => ({ online: false }), state: { messages: [] }, publicJobs: () => [] };
test('Responses API 함수 호출을 검증된 파일 작업으로 변환한다', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    assert.match(url, /\/responses$/); assert.equal(body.store, false);
    assert.equal(body.parallel_tool_calls, false);
    return Response.json({ output: [{ type: 'function_call', name: 'create_file', arguments: JSON.stringify({ filename: '할일.md', content: '- 장보기' }) }] });
  });
  const result = await plan('할일 파일 만들어 줘', store, config);
  assert.deepEqual(result.action, { type: 'create_file', filename: '할일.md', content: '- 장보기' });
});
test('모델이 잘못된 경로를 반환해도 파일 실행 요청을 만들지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ output: [{ type: 'function_call', name: 'create_file', arguments: JSON.stringify({ filename: '../bad.txt', content: 'bad' }) }] }));
  await assert.rejects(plan('파일', store, config), /파일명/);
});
test('음성 요청은 WAV multipart와 한국어 설정을 전송하고 결과를 추출한다', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /\/audio\/transcriptions$/);
    assert.equal(options.body.get('language'), 'ko');
    assert.equal(options.body.get('file').name, 'recording.wav');
    assert.equal(options.body.get('file').type, 'audio/wav');
    return Response.json({ text: ' 메모 저장해 줘 ' });
  });
  assert.equal(await transcribe(Buffer.from('test-wav-data').toString('base64'), config), '메모 저장해 줘');
});
