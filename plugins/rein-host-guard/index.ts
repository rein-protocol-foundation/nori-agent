import { readFileSync } from 'node:fs';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { createHostGuard } from './guard.mjs';

export default definePluginEntry({
  id: 'rein-host-guard',
  name: 'Nori host accident guard',
  register(api) {
    api.on('before_prompt_build', (_event, ctx) => {
      if (ctx.channel === 'slack') return {
        prependSystemContext: readFileSync(new URL('./OPERATIONS.md', import.meta.url), 'utf8'),
      };
    });
    api.on('before_tool_call', createHostGuard(api.pluginConfig), { priority: 1000 });
  },
});
