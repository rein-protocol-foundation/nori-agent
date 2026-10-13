import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public Discord acceptance reports contain summaries rather than linkable runtime records',()=>{
  for(const name of ['discord-onboarding-live-acceptance-2026-10-13.md','discord-onboarding-tone-followup-2026-10-13.md']) {
    const text=readFileSync(new URL(`../docs/${name}`,import.meta.url),'utf8');
    for(const pattern of [/\b\d{17,20}\b/,/https:\/\/[^\s]*discord[^\s]*\/(?:channels|events)\//i,/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,/^> /m])
      assert.equal(pattern.test(text),false,`${name} must not contain live IDs, message links, exact message timestamps or transcript blocks`);
    assert.match(text,/gitignored/);
  }
});
