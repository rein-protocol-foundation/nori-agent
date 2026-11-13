import test from 'node:test';
import assert from 'node:assert/strict';
import { selectContinuationChildInput } from './fixtures/task-continuation-model-input.mjs';

test('native child task survives trailing conversation inventory metadata', () => {
  for (const kind of ['GAP', 'SUPPLEMENT']) {
    const input = [{ role: 'user', content: `[fixture] [Subagent Context] Complete the current [Subagent Task].\n\n[Subagent Task]\n\nCONTINUATION_${kind}_CHILD: synthetic work` },
      { role: 'user', content: [{ type: 'text', text: '<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nConversation data: Active Subagents none\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>' }] }];
    assert.equal(selectContinuationChildInput(input), kind.toLowerCase());
  }
});

test('completion result and historical task inventory cannot masquerade as child execution', () => {
  assert.equal(selectContinuationChildInput([{ role: 'user', content: '[Internal task completion event]\n[Subagent Task]\nCONTINUATION_SUPPLEMENT_CHILD: quoted assignment' }]), undefined);
  assert.equal(selectContinuationChildInput([{ role: 'user', content: [{ type: 'text', text: '<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\n[Subagent Task]\nCONTINUATION_GAP_CHILD: inventory\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>' }] }]), undefined);
});
