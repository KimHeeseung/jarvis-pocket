import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const executable = existsSync('/Applications/Tailscale.app/Contents/MacOS/Tailscale') ? '/Applications/Tailscale.app/Contents/MacOS/Tailscale' : 'tailscale';
function call(args) {return execFileSync(executable,args,{encoding:'utf8',timeout:15000});}
function jsonCall(args) {
  const output = call(args);
  if (output.includes('Failed to load preferences')) {
    throw new Error('Tailscale 설정을 읽지 못했습니다. Mac에서 Tailscale을 열고 연결 상태를 확인한 뒤, 일반 터미널의 새 창에서 npm run remote:setup을 실행하세요.');
  }
  try { return JSON.parse(output); }
  catch { throw new Error(`Tailscale 응답을 읽지 못했습니다: ${output.trim().slice(0, 300)}`); }
}
try {
  const status=jsonCall(['status','--json']);
  if(status.BackendState !== 'Running') throw new Error('Mac의 Tailscale에 로그인하고 VPN을 켜주세요.');
  const dns=status.Self?.DNSName?.replace(/\.$/,'');
  if(!dns || !dns.endsWith('.ts.net')) throw new Error('Tailscale에서 MagicDNS를 켜주세요.');
  const previous=jsonCall(['serve','status','--json']);
  if(Object.keys(previous).length && !JSON.stringify(previous).includes('http://127.0.0.1:8787')) throw new Error('기존 Tailscale Serve 설정이 있어 덮어쓰지 않았습니다. 포트 설정을 확인하세요.');
  const serve=spawnSync(executable,['serve','--bg','--yes','http://127.0.0.1:8787'],{stdio:'inherit',timeout:30000});
  if(serve.status !== 0) throw new Error('표시된 Tailscale 안내에서 HTTPS를 활성화한 뒤 다시 실행해 주세요.');
  const url=`https://${dns}`;
  const health=await fetch(url+'/health',{signal:AbortSignal.timeout(10000)});
  if(!health.ok) throw new Error('HTTPS 서버 확인에 실패했습니다. npm start 실행 여부를 확인하세요.');
  execFileSync(process.execPath,['mobile/scripts/configure-personal.cjs'],{cwd:root,env:{...process.env,JARVIS_MOBILE_URL:url},stdio:'inherit'});
  const envFile=root+'/.env';let env=readFileSync(envFile,'utf8');
  env=env.replace(/^JARVIS_MOBILE_URL=.*\n?/m,'');writeFileSync(envFile,env.trimEnd()+`\nJARVIS_MOBILE_URL=${url}\n`,{mode:0o600});
  console.log('외부 연결 기본값을 저장했습니다. iPhone도 같은 Tailscale 계정으로 연결하고 Personal 스킴으로 재빌드하세요.');
} catch(error) { console.error(error.code === 'ENOENT' ? 'Mac과 iPhone에 Tailscale을 설치하고 같은 계정으로 로그인하세요: https://tailscale.com/download' : error.message);process.exitCode=1; }
