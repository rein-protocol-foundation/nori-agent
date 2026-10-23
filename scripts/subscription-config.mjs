import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildOpenClawFragment } from '../plugins/rein-router/policy.mjs';

// Offline only: emit a reviewable fragment, never merge or activate a runtime config.
try {
  const { values, positionals } = parseArgs({ options: { output: { type: 'string' } }, allowPositionals: true });
  if (positionals.length < 1 || positionals.length > 2 || values.output === '')
    throw new Error('Usage: npm run toolchain:pnpm -- run config:subscriptions <router-config.json> [absolute-plugin-path] [--output <fragment.json>]');
  const input = resolve(positionals[0]);
  const output = values.output === undefined ? undefined : resolve(values.output);
  if (output === input) throw new Error('rein_router_output_invalid: fragment must not replace its source configuration');
  let config;
  try { config = JSON.parse(readFileSync(input, 'utf8')); }
  catch { throw new Error('rein_router_input_invalid: readable JSON configuration required'); }
  const pluginPath = positionals[1] ?? fileURLToPath(new URL('../plugins/rein-router', import.meta.url));
  const fragment = `${JSON.stringify(buildOpenClawFragment(config, pluginPath), null, 2)}\n`;
  if (output === undefined) process.stdout.write(fragment);
  else {
    // File output stays pure JSON even when npm/pnpm prints lifecycle banners.
    const temporary = mkdtempSync(join(dirname(output), '.rein-router-fragment-'));
    try {
      const file = join(temporary, 'fragment.json');
      writeFileSync(file, fragment, { mode: 0o600, flag: 'wx' });
      renameSync(file, output);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
    process.stdout.write(`Wrote Router config fragment: ${output}\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
