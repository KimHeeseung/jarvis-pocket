export function validateAction(action) {
  if (!action || typeof action !== 'object') throw new Error('잘못된 작업입니다.');
  if (action.type === 'codex_task') {
    if (typeof action.prompt !== 'string' || !action.prompt.trim() || action.prompt.length > 30000) throw new Error('잘못된 PC 작업 요청입니다.');
    return { type: 'codex_task', prompt: action.prompt };
  }
  if (action.type === 'list_files') return { type: 'list_files' };
  if (action.type !== 'create_file') throw new Error('지원하지 않는 작업입니다.');
  const { filename, content } = action;
  if (typeof filename !== 'string' || !/^[\p{L}\p{N}_ -][\p{L}\p{N}_. -]{0,99}\.(txt|md|json|csv)$/u.test(filename) || /\.\.|[. ]$/.test(filename)) {
    throw new Error('파일명은 경로 없이 입력하세요. txt, md, json, csv만 지원합니다.');
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(filename)) throw new Error('사용할 수 없는 파일명입니다.');
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 100000) throw new Error('파일 내용은 100KB 이하여야 합니다.');
  return { type: 'create_file', filename, content };
}
