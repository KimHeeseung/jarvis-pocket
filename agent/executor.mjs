import { mkdir, realpath, lstat, readdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { validateAction } from '../shared/actions.mjs';

export async function execute(job, root) {
  const action = validateAction(job.action);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const base = await realpath(root);
  if (action.type === 'list_files') {
    const files = [];
    for (const dir of await readdir(base, { withFileTypes: true })) {
      if (!dir.isDirectory() || !/^[a-f0-9-]{36}$/.test(dir.name)) continue;
      for (const file of await readdir(join(base, dir.name), { withFileTypes: true })) {
        if (file.isFile()) files.push(`${dir.name}/${file.name}`);
        if (files.length >= 200) return files.join('\n') + '\n(최대 200개 표시)';
      }
    }
    return files.length ? files.join('\n') : '아직 생성된 파일이 없습니다.';
  }
  if (!/^[a-f0-9-]{36}$/.test(job.id)) throw new Error('잘못된 작업 ID입니다.');
  const dir = join(base, job.id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink() || await realpath(dir) !== dir) throw new Error('심볼릭 링크 폴더는 사용할 수 없습니다.');
  const target = join(dir, action.filename);
  let file;
  try {
    file = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    await file.writeFile(action.content, 'utf8');
    await file.sync();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await lstat(target)).isFile() || (await lstat(target)).isSymbolicLink()) throw new Error('기존 경로가 일반 파일이 아닙니다.');
    const existing = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try { if (await existing.readFile('utf8') !== action.content) throw new Error('동일한 작업 경로에 다른 파일이 있어 덮어쓰지 않았습니다.'); }
    finally { await existing.close(); }
  } finally { await file?.close(); }
  return `파일 생성 완료: ${target}`;
}
