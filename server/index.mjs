import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Store } from './store.mjs';
import { plan, transcribe } from './ai.mjs';
import { validateAction } from '../shared/actions.mjs';

function authorized(req, token) {
  const given = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 9 * 1024 * 1024) { const error = new Error('요청이 너무 큽니다.'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw new Error('올바른 JSON이 필요합니다.'); }
}
export function createApp(config, planner = plan) {
  if (!config.appToken || config.appToken.length < 32 || !config.agentToken || config.agentToken.length < 32 || config.appToken === config.agentToken) throw new Error('서로 다른 32자 이상의 APP_TOKEN과 AGENT_TOKEN이 필요합니다. npm run setup을 실행하세요.');
  const store = new Store(config.dataDir);
  const pending = new Map();
  const server = createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (path === '/health' && req.method === 'GET') return send(200, { ok: true });
      const isAgent = path.startsWith('/agent/');
      if (!authorized(req, isAgent ? config.agentToken : config.appToken)) return send(401, { error: '연결 토큰을 확인하세요.' });
      if (req.method === 'GET' && path === '/state') return send(200, { pc: store.status(), jobs: store.publicJobs(), messages: store.state.messages.slice(-50), demo: config.demo });
      if (req.method === 'POST' && path === '/agent/claim') return send(200, { job: store.claim() });
      if (req.method === 'POST' && path === '/agent/renew') {
        const data = await body(req);
        return send(store.renew(data.id, data.lease) ? 200 : 409, { received: true });
      }
      if (req.method === 'POST' && path === '/agent/complete') {
        const data = await body(req);
        if (typeof data.ok !== 'boolean' || typeof data.result !== 'string' || data.result.length > 100000) throw new Error('잘못된 작업 결과입니다.');
        return send(store.complete(data.id, data.lease, data.result, data.ok) ? 200 : 409, { received: true });
      }
      if (req.method === 'POST' && path === '/message') {
        const data = await body(req);
        if (typeof data.requestId !== 'string' || !/^[\w-]{8,100}$/.test(data.requestId)) throw new Error('요청 ID가 필요합니다.');
        if (Object.hasOwn(store.state.requests, data.requestId)) return send(200, store.state.requests[data.requestId]);
        if (pending.has(data.requestId)) return send(200, await pending.get(data.requestId));
        if (pending.size >= 1) return send(429, { error: '이전 요청을 처리 중입니다. 잠시 뒤 다시 보내세요.' });
        const work = (async () => {
          const text = data.audioBase64 ? await transcribe(data.audioBase64, config, data.audioFormat) : data.text;
          if (typeof text !== 'string' || !text.trim() || text.length > 10000) throw new Error('메시지는 1~10,000자로 입력하세요.');
          const result = await planner(text.trim(), store, config);
          let reply = result.reply;
          let job = null;
          if (result.action) {
            job = store.enqueue(validateAction(result.action));
            reply = `${result.action.type === 'create_file' ? `“${result.action.filename}” 파일 생성` : result.action.type === 'codex_task' ? 'Mac Codex 작업' : '파일 목록 조회'} 요청을 저장했어요. ${store.online() ? 'PC에서 실행한 결과는 작업 탭에서 확인하세요.' : 'PC가 연결되면 실행합니다.'}`;
          }
          store.state.messages.push({ role: 'user', text: text.trim(), at: Date.now() }, { role: 'assistant', text: reply, at: Date.now() });
          store.state.messages = store.state.messages.slice(-100);
          const response = { text, reply, jobId: job?.id ?? null };
          store.state.requests[data.requestId] = response;
          store.save();
          return response;
        })();
        pending.set(data.requestId, work);
        try { return send(200, await work); } finally { pending.delete(data.requestId); }
      }
      send(404, { error: '경로를 찾을 수 없습니다.' });
    } catch (error) { send(error.status ?? 400, { error: error.message || '요청 처리에 실패했습니다.' }); }
  });
  server.requestTimeout = 90000;
  return { server, store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = { appToken: process.env.APP_TOKEN, agentToken: process.env.AGENT_TOKEN, dataDir: process.env.DATA_DIR || './data', backend: process.env.AI_BACKEND || 'api', demo: process.env.AI_BACKEND !== 'codex' && process.env.DEMO_MODE === 'true', key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', transcribeModel: process.env.TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe' };
  const { server } = createApp(config);
  server.listen(Number(process.env.PORT || 8787), process.env.HOST || '0.0.0.0', () => console.log(`Jarvis 서버 :${process.env.PORT || 8787} (${config.demo ? '데모' : config.backend === 'codex' ? 'Mac Codex 실행 모드' : 'OpenAI 연결 모드'})`));
}
