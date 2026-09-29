import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';

export function resolveCodex({ env = process.env, platform = process.platform, appPaths } = {}) {
  const executable = path => {
    try { accessSync(path, constants.X_OK); return statSync(path).isFile(); }
    catch { return false; }
  };
  const onPath = name => (env.PATH || '').split(delimiter).filter(Boolean).map(dir => resolve(dir, name));
  const configured = env.CODEX_BIN?.trim();
  let candidates;
  if (configured) {
    candidates = /[/\\]/.test(configured) ? [resolve(configured)] : onPath(configured);
  } else {
    candidates = onPath('codex');
    if (platform === 'darwin') {
      const folders = ['/Applications', ...(env.HOME ? [join(env.HOME, 'Applications')] : [])];
      candidates.push(...(appPaths ?? folders.flatMap(dir => ['ChatGPT.app', 'Codex.app'].map(app => join(dir, app, 'Contents/Resources/codex')))));
    }
  }
  const found = candidates.find(executable);
  if (!found) throw new Error('Codex 실행 파일을 찾지 못했습니다. Mac의 ChatGPT/Codex 설치 위치를 확인하거나 서버 .env의 CODEX_BIN에 실행 파일의 전체 경로를 설정하고 서버를 재시작하세요.');
  return found;
}
