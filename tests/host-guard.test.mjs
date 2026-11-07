import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostGuard } from '../plugins/rein-host-guard/guard.mjs';
const guard = createHostGuard({ defaultCwd: '/home/nori/work', protectedPaths: ['/etc', '/usr', '/home/nori/app/vendor/openclaw', '/home/nori/app/plugins'] });
for (const command of ['rm -rf /etc', 'sudo rm -rf /usr/lib', 'rm -rf /home/nori/app', 'cd /home/nori/app && rm -rf vendor/openclaw', 'find /etc -delete', 'rm "/home/nori/app/plugins/core.ts"', 'rsync --delete src/ /home/nori/app/plugins/']) {
  test('blocks ' + command, () => assert.equal(guard({ toolName: 'exec', params: { command } })?.block, true));
}
for (const command of ['printf NORI_OK', 'sudo apt-get install ripgrep', 'npm install', 'rm -rf /home/nori/project/dist', 'git status']) {
  test('allows ' + command, () => assert.equal(guard({ toolName: 'exec', params: { command } }), undefined));
}
test('protected cwd', () => assert.equal(guard({ toolName: 'exec', params: { command: 'rm core.ts', workdir: '/home/nori/app/plugins' } })?.block, true));
test('patch deletion and edits', () => {
  assert.equal(guard({ toolName: 'apply_patch', params: { input: '*** Delete File: /home/nori/app/plugins/core.ts' } })?.block, true);
  assert.equal(guard({ toolName: 'edit', params: { path: '/home/nori/app/plugins/core.ts' } }), undefined);
});
