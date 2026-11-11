import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSaOpsFixtureInput} from './fixtures/sa-ops-model-input.mjs';
test('native historical internal metadata cannot override the current synthetic user instruction',()=>{
  const messages=[{role:'user',content:'old request\nSA_NATIVE_CHILD'},
    {role:'user',content:'current request\nSA_CREATE_A'},
    {role:'user',content:[{type:'text',text:'<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nRecently Completed Subagents\nSA_CHILD_RESULT\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>'}]}];
  assert.deepEqual(selectSaOpsFixtureInput(messages),{at:1,tag:'SA_CREATE_A'});
});
test('fixture protocol decodes text blocks and preserves native Cron/child task and announcement formats',()=>{
  for(const content of ['[cron:synthetic job-a] SA_CRON_A\nCurrent time: fixture',
    [{type:'text',text:'SA_CRON_A'}]])assert.equal(selectSaOpsFixtureInput([{role:'user',content}]).tag,'SA_CRON_A');
  for(const content of ['[Subagent Task]\n\nSA_CHILD_RESULT\nBegin.',
    'A background task completed.\nsource: subagent\n<prompt-data>\nACK SA_CHILD_RESULT\n</prompt-data>'])
    assert.equal(selectSaOpsFixtureInput([{role:'user',content}]).tag,'SA_CHILD_RESULT');
});
test('embedded incidental tags and all-internal messages do not become fixture instructions',()=>{
  assert.equal(selectSaOpsFixtureInput([{role:'user',content:'A quoted SA_CREATE_A is not a command.'}]).at,-1);
  assert.equal(selectSaOpsFixtureInput([{role:'user',content:'<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nSA_CREATE_A'}]).at,-1);
});
