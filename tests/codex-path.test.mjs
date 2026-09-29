import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCodex } from '../agent/codex-path.mjs';

test('터미널 PATH에 Codex가 없어도 앱 번들 실행 파일을 찾는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-path-'));
  try {
    const binary = join(dir, 'codex');
    writeFileSync(binary, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    assert.equal(resolveCodex({ env: { PATH: '' }, platform: 'darwin', appPaths: [binary] }), binary);
    assert.equal(resolveCodex({ env: { PATH: dir }, platform: 'linux' }), binary);
    assert.throws(() => resolveCodex({ env: { PATH: dir, CODEX_BIN: '/missing/codex' }, platform: 'darwin', appPaths: [binary] }), /CODEX_BIN/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
