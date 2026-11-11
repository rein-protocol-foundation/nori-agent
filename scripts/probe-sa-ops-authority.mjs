// SA-OPS-01/#66: local synthetic boundary reproduction, never a scheduler acceptance test.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const native = fileURLToPath(new URL('../vendor/openclaw/', import.meta.url));
const fixture = fileURLToPath(new URL('../tests/fixtures/sa-ops-authority.ts', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'sa-ops-authority-'));
try {
  const home = join(scratch, 'home'), state = join(scratch, 'state'), temp = join(scratch, 'tmp');
  for (const directory of [home, state, temp]) mkdirSync(directory, { mode: 0o700 });
  const result = spawnSync(process.execPath, ['--import', './scripts/tsx.mjs', fixture], {
    cwd: native,
    // Only PATH is inherited. All simulation comes from the fixture; native imports see
    // a disposable empty home/state and a deliberately nonexistent configuration path.
    env: { PATH: process.env.PATH, HOME: home, OPENCLAW_STATE_DIR: state,
      OPENCLAW_CONFIG_PATH: join(state, 'absent-config.json'), TMPDIR: temp, TSX_DISABLE_CACHE: '1' },
    stdio: 'inherit', timeout: 60_000,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
