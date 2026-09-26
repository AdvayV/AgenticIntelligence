import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
for (const dir of ['src', 'public', 'scripts', 'tests']) {
  for (const file of await readdir(dir)) if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'inherit' });
}
console.log('JavaScript syntax checks passed.');
