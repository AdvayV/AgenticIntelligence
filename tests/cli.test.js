import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

test('missing CLI option values fail without silently indexing the working tree', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'codestrata-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  for (const args of [['index', '--history'], ['index', '--refs'], ['index', '--version'], ['index', '--repo', '--history', '3'], ['search', '--out']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /requires a value/);
    assert.deepEqual(await readdir(dir), [], 'Invalid arguments must not create an index');
  }
});
