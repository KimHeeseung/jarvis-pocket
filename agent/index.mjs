import { executeCodex } from './codex.mjs';
import { execute } from './executor.mjs';
const base = (process.env.SERVER_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const token = process.env.AGENT_TOKEN;
if (!token || token.length < 32) throw new Error('AGENT_TOKEN을 설정하세요.');
const root = process.env.AGENT_ROOT || './pc-files';
const codexWorkspace = process.env.CODEX_WORKSPACE || '.';
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
async function post(path, data = {}) {
  const res = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
  return res.json();
}
console.log(`PC 에이전트 시작. Codex 작업 폴더: ${codexWorkspace}`);
while (!stopping) {
  try {
    const { job } = await post('/agent/claim');
    if (job) {
      let ok = true, result;
      const controller = new AbortController();
      let renewing = false;
      const renew = setInterval(async () => {
        if (renewing) return;
        renewing = true;
        try { await post('/agent/renew', { id: job.id, lease: job.lease }); }
        catch { controller.abort(); }
        finally { renewing = false; }
      }, 8000);
      const cancel = () => controller.abort();
      process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
      try { result = job.action.type === 'codex_task'
        ? await executeCodex(job, codexWorkspace, { signal: controller.signal })
        : await execute(job, root); }
      catch (error) { ok = false; result = error.message; }
      finally { clearInterval(renew); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
      await post('/agent/complete', { id: job.id, lease: job.lease, ok, result });
      console.log(`${job.id}: ${ok ? '완료' : '실패'}`);
    }
  } catch (error) { console.error(`연결 대기: ${error.message}`); }
  if (!stopping) await new Promise(resolve => setTimeout(resolve, 3000));
}
