import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const out = await mkdtemp(join(tmpdir(), 'rhythm-forge-tests-'));
try {
  await build({ entryPoints: ['tests/music.test.ts'], outfile: join(out, 'tests.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22' });
  const result = spawnSync(process.execPath, ['--test', join(out, 'tests.cjs')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(out, { recursive: true }); }
