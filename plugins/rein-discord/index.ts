import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

// Keep a diagnostic entry for old profiles. Never silently take over the native
// channel or switch a withdrawn profile back to shared routing.
export default definePluginEntry({
  id: 'rein-discord',
  name: 'Withdrawn Nori Discord adapter',
  description: 'Withdrawn channel replacement; see docs/discord-isolation-redesign.md.',
  register() {
    throw new Error('rein-discord has been withdrawn. Restore the reviewed native Discord profile; see docs/discord-isolation-redesign.md. Native guild sessions remain channel-shared.');
  },
});
