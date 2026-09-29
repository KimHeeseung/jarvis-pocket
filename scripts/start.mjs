import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
let stopping = false;
const children = ['server/index.mjs', 'agent/index.mjs'].map(file => spawn(process.execPath, ['--env-file=.env', file], { cwd, stdio: 'inherit' }));
if (process.platform === 'darwin') children.push(spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], {stdio:'ignore'}));
function stop() { if(stopping) return; stopping=true; for(const child of children) child.kill('SIGTERM'); }
process.on('SIGINT',stop);process.on('SIGTERM',stop);
for(const child of children) {
  child.once('error',error=>{console.error(error.message);process.exitCode=1;stop();});
  child.once('exit',code=>{if(!stopping){process.exitCode=code || 1;stop();}});
}
console.log('Jarvis 서버 + PC 에이전트 실행. 종료: Ctrl+C. Mac 덮개는 열어 두세요.');
