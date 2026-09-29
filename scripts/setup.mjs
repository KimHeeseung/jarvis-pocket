import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
if (!existsSync('.env')) {
  const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  writeFileSync('.env', example
    .replace('replace-with-a-random-token-at-least-32-characters', randomBytes(32).toString('hex'))
    .replace('replace-with-a-different-random-token-at-least-32-characters', randomBytes(32).toString('hex')), { mode: 0o600 });
  console.log('.env 생성 완료. APP_TOKEN을 앱 연결 화면에 입력하세요.');
} else console.log('기존 .env를 유지합니다.');
for (const entries of Object.values(networkInterfaces())) for (const entry of entries ?? []) {
  if (entry.family === 'IPv4' && !entry.internal) console.log(`같은 Wi-Fi의 앱 서버 주소: http://${entry.address}:8787`);
}
console.log('npm run server / 새 터미널: npm run agent / 새 터미널: npm run mobile');
