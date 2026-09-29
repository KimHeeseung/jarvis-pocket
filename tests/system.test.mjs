import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/index.mjs';
import { execute } from '../agent/executor.mjs';
import { validateAction } from '../shared/actions.mjs';
const action = { type: 'create_file', filename: '테스트.txt', content: '안녕하세요, 자비스입니다.' };
async function temp(t) { const dir = await mkdtemp(join(tmpdir(), 'jarvis-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
test('오프라인 작업과 요청 기록은 서버 재시작 후 유지된다', async t => {
  const dir = await temp(t); const store = new Store(dir);
  store.enqueue(action); store.save();
  const restarted = new Store(dir);
  assert.equal(restarted.online(), false); assert.equal(restarted.state.jobs.length, 1);
  assert.equal(restarted.claim().status, 'running');
});
test('에이전트 종료 시 임대 만료 후 재할당하고 이전 결과는 거절한다', async t => {
  let now = 1000; const store = new Store(await temp(t), () => now);
  store.enqueue(action); const first = store.claim();
  assert.equal(store.claim(), null); now += 31000;
  const second = store.claim();
  assert.equal(first.id, second.id); assert.notEqual(first.lease, second.lease);
  assert.equal(store.complete(first.id, first.lease, 'old', true), false);
  assert.equal(store.complete(second.id, second.lease, 'done', true), true);
});
test('PC 연결 표시는 최근 폴링이 있을 때만 켜진다', async t => {
  let now = 0; const store = new Store(await temp(t), () => now);
  assert.equal(store.online(), false); store.heartbeat(); assert.equal(store.online(), true);
  now = 16000; assert.equal(store.online(), false);
});
test('실제 파일 생성 및 재시도는 동일한 파일 하나만 만든다', async t => {
  const root = await temp(t); const job = { id: randomUUID(), action };
  const first = await execute(job, root); assert.equal(await execute(job, root), first);
  assert.equal(await readFile(join(root, job.id, action.filename), 'utf8'), action.content);
  assert.equal((await readdir(root)).length, 1);
  await assert.rejects(execute({ ...job, action: { ...action, content: '다른 내용' } }, root), /덮어쓰지/);
});
test('경로 이탈, 실행 파일, 잘못된 명령을 거절한다', () => {
  for (const filename of ['../outside.txt', '/tmp/file.txt', 'x.sh', 'x.exe', 'a\\b.txt', 'CON.txt']) assert.throws(() => validateAction({ ...action, filename }));
  assert.throws(() => validateAction({ type: 'shell', command: 'ls' }));
  assert.throws(() => validateAction({ ...action, content: 'x'.repeat(100001) }));
});
test('작업 폴더 심볼릭 링크를 따라가지 않는다', async t => {
  const root = await temp(t); const outside = await temp(t); const id = randomUUID();
  await symlink(outside, join(root, id), 'dir');
  await assert.rejects(execute({ id, action }, root), /심볼릭/);
  assert.deepEqual(await readdir(outside), []);
});
async function serverFixture(t, planner) {
  const config = { appToken: 'a'.repeat(40), agentToken: 'b'.repeat(40), dataDir: await temp(t), demo: true };
  const app = createApp(config, planner);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = (path, token, data) => fetch(base + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  return { ...app, config, call };
}
test('앱과 에이전트 토큰 권한을 분리한다', async t => {
  const { call, config } = await serverFixture(t);
  assert.equal((await call('/state', '')).status, 401);
  assert.equal((await call('/state', config.agentToken)).status, 401);
  assert.equal((await call('/agent/claim', config.appToken, {})).status, 401);
  assert.equal((await call('/state', config.appToken)).status, 200);
});
test('동시 재전송을 하나로 합쳐 API 호출과 작업 중복을 방지한다', async t => {
  let count = 0;
  const { call, config, store } = await serverFixture(t, async () => { count++; await new Promise(r => setTimeout(r, 30)); return { action }; });
  const input = { requestId: 'same-request-id', text: '파일 만들어 줘' };
  const responses = await Promise.all([call('/message', config.appToken, input), call('/message', config.appToken, input)]);
  const results = await Promise.all(responses.map(r => r.json()));
  assert.equal(results[0].jobId, results[1].jobId); assert.equal(count, 1); assert.equal(store.state.jobs.length, 1);
  assert.equal((await call('/message', config.appToken, input)).status, 200); assert.equal(count, 1);
});
test('HTTP 요청 → 대기 → 에이전트 파일 생성 → 완료 결과 전체 흐름', async t => {
  const { call, config } = await serverFixture(t);
  const reply = await (await call('/message', config.appToken, { requestId: 'end-to-end-id', text: '테스트 파일 만들어 줘' })).json();
  assert.match(reply.reply, /PC가 연결되면/);
  const before = await (await call('/state', config.appToken)).json(); assert.equal(before.jobs[0].status, 'queued');
  const { job } = await (await call('/agent/claim', config.agentToken, {})).json();
  const result = await execute(job, await temp(t));
  assert.equal((await call('/agent/complete', config.agentToken, { id: job.id, lease: job.lease, ok: true, result })).status, 200);
  const after = await (await call('/state', config.appToken)).json();
  assert.equal(after.jobs[0].status, 'done'); assert.equal(after.jobs[0].lease, undefined); assert.match(after.jobs[0].result, /파일 생성 완료/);
});
