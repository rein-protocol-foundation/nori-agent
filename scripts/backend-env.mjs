import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export const DEFAULT_BACKEND_URL = 'https://rein-protocol.org';

const BACKEND_KEYS = [
  'REIN_BACKEND_URL',
  'REIN_AGENT_CALLER_ID',
  'REIN_AGENT_CREDENTIAL',
  'REIN_PROPOSAL_CONFIRMATION_KEY',
];

// .env.local also contains unrelated account credentials. Only pass the four
// backend settings to OpenClaw, preserving explicit launcher environment values.
export function loadBackendEnvironment({ root, environment = process.env }) {
  const result = { ...environment };
  let contents = '';
  try { contents = readFileSync(join(root, '.env.local'), 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const local = parseEnv(contents);
  for (const name of BACKEND_KEYS) {
    if (result[name] === undefined && local[name] !== undefined) result[name] = local[name];
  }
  if (result.REIN_BACKEND_URL === undefined) result.REIN_BACKEND_URL = DEFAULT_BACKEND_URL;
  return result;
}
