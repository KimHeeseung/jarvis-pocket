import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { executeCodex } from '../agent/codex.mjs';
import { Store } from '../server/store.mjs';
import { plan } from '../server/ai.mjs';
test('Codex 실행 결과를 보관해 완료 재전송 시 작업을 다시 실행하지 않는다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-codex-'));
  const previous = process.env.CODEX_RECEIPTS;
  process.env.CODEX_RECEIPTS = join(dir, 'receipts');
  try {
    const fake = join(dir, 'codex');
    writeFileSync(fake, `#!/usr/bin/env node\nconst fs=require('fs');const a=process.argv.slice(2);let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{fs.writeFileSync(a[a.indexOf('-o')+1], JSON.stringify({outcome:'completed',summary:'실제 결과'}));fs.appendFileSync(${JSON.stringify(join(dir,'calls'))}, '1');});`, {mode:0o700});
    const job = {id:randomUUID(), action:{type:'codex_task',prompt:'문서 작성'}};
    assert.equal(await executeCodex(job, dir, {command:fake}), '실제 결과');
    assert.equal(await executeCodex(job, dir, {command:fake}), '실제 결과');
    assert.equal(readFileSync(join(dir,'calls'),'utf8'),'1');
  } finally { if(previous === undefined) delete process.env.CODEX_RECEIPTS; else process.env.CODEX_RECEIPTS=previous; rmSync(dir,{recursive:true,force:true}); }
});
test('긴 작업 임대 갱신과 오래된 임대 거부', () => {
  const dir=mkdtempSync(join(tmpdir(),'jarvis-lease-'));let now=0;
  try {
    const s=new Store(dir,()=>now); s.enqueue({type:'codex_task',prompt:'테스트'});const job=s.claim();
    now=20000;assert.equal(s.renew(job.id,job.lease),true);now=40000;assert.equal(s.claim(),null);
    assert.equal(s.renew(job.id,'wrong'),false);now=60000;assert.equal(s.renew(job.id,job.lease),false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('Codex 모드는 API 키 없이 실제 PC 작업으로 전달한다', async () => {
  const result=await plan('프로젝트 테스트 실행해 줘',{state:{messages:[]},publicJobs:()=>[]},{backend:'codex',demo:false});
  assert.equal(result.action.type,'codex_task');assert.match(result.action.prompt,/프로젝트 테스트/);
});
test('Codex가 권한 차단을 보고하면 완료로 표시하지 않는다', async () => {
  const dir=mkdtempSync(join(tmpdir(),'jarvis-blocked-'));const old=process.env.CODEX_RECEIPTS;process.env.CODEX_RECEIPTS=join(dir,'receipts');
  try {
    const fake=join(dir,'codex');
    writeFileSync(fake,`#!/usr/bin/env node\nconst fs=require('fs');const a=process.argv;process.stdin.resume();process.stdin.on('end',()=>fs.writeFileSync(a[a.indexOf('-o')+1],JSON.stringify({outcome:'blocked',summary:'권한이 필요합니다.'})));`,{mode:0o700});
    await assert.rejects(executeCodex({id:randomUUID(),action:{type:'codex_task',prompt:'파일 생성'}},dir,{command:fake}),/권한이 필요/);
  } finally {if(old===undefined)delete process.env.CODEX_RECEIPTS;else process.env.CODEX_RECEIPTS=old;rmSync(dir,{recursive:true,force:true});}
});

test('추가 쓰기 폴더를 셸 없이 개별 인수로 전달하고 상대 경로를 거부한다', async () => {
  const { extraDirectoryArgs } = await import('../agent/codex.mjs');
  assert.deepEqual(extraDirectoryArgs('["/Users/test/My Projects","/Users/test/Desktop","/Users/test/Desktop"]'), ['--add-dir','/Users/test/My Projects','--add-dir','/Users/test/Desktop']);
  assert.throws(() => extraDirectoryArgs('["../outside"]'), /절대 경로/);
  assert.throws(() => extraDirectoryArgs('{}'), /JSON 배열/);
});
