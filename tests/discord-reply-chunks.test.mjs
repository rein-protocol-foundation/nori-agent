import test from 'node:test';
import assert from 'node:assert/strict';
import { splitDiscordReply } from '../plugins/rein-discord/reply-chunks.mjs';

for(const [label,text] of [
  ['empty and short replies',''],['short Unicode reply','你好 👋'],
  ['exact ASCII boundary','a'.repeat(1900)],
  ['emoji crossing the old code-unit boundary','a'.repeat(1899)+'😀'+'b'.repeat(1900)],
  ['long supplementary Unicode content','😀𠮷'.repeat(1500)],
  ['mixed Chinese, combining marks and emoji sequences','中文 e\u0301 👩🏽‍💻 '.repeat(500)],
]) test(`Discord chunks preserve ${label}`,()=>{
  const chunks=[...splitDiscordReply(text)];
  assert.equal(chunks.join(''),text);
  for(const chunk of chunks) {
    assert.ok(chunk.length>0 && chunk.length<=1900);
    assert.equal(chunk.isWellFormed(),true);
  }
  if(text==='')assert.deepEqual(chunks,[]);
});
