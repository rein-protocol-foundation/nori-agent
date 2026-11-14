import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Writable, Readable } from 'node:stream';
import { mkdir, open, readFile, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { runToolRequest, resumeToolRequest } from '@clawdbot/lobster/core';

/** Public Lobster core only. The fixed workflow never calls an OpenClaw CLI bridge. */
export function createNativeLobster({ stateDir, templatePath = fileURLToPath(new URL('./partnership-test-send.lobster', import.meta.url)) }) {
  const templatesDir = path.join(stateDir, 'templates');
  const digestOf = content => createHash('sha256').update(content).digest('hex');
  const savedPath = digest => path.join(templatesDir, `${digest}.lobster`);
  async function verifyTemplate(digest) {
    if (!/^[0-9a-f]{64}$/.test(digest ?? '')) throw Error('Saved template identity unavailable');
    const filePath = savedPath(digest);
    if (digestOf(await readFile(filePath)) !== digest) throw Error('Saved template content changed');
    return filePath;
  }
  async function persistTemplate() {
    const content = await readFile(templatePath);
    if (content.length > 65_536) throw Error('Fixed template exceeds size limit');
    const digest = digestOf(content), target = savedPath(digest);
    await mkdir(templatesDir, { recursive: true, mode: 0o700 });
    const temporary = path.join(templatesDir, `${randomUUID()}.tmp`), handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
    try {
      try { await link(temporary, target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      await verifyTemplate(digest);
      const directory = await open(templatesDir, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } finally { await unlink(temporary).catch(() => {}); }
    return { filePath: target, digest };
  }
  const context = (identity = {}) => ({
    cwd: stateDir, mode: 'tool',
    // Do not expose Slack/mail credentials to workflow shell steps.
    // createToolContext merges ambient env; explicit undefined values erase it.
    env: { ...Object.fromEntries(Object.keys(process.env).map(key => [key, undefined])),
      PATH: process.env.PATH, HOME: process.env.HOME, PARTNERSHIP_NODE: process.execPath,
      LOBSTER_STATE_DIR: stateDir, LOBSTER_APPROVAL_INITIATED_BY: identity.initiator,
      LOBSTER_APPROVAL_REQUIRED_APPROVER: identity.approver,
      LOBSTER_APPROVAL_APPROVED_BY: identity.actor },
    stdin: Readable.from([]), stdout: new Writable({ write(_chunk, _encoding, done) { done(); } }),
    stderr: new Writable({ write(_chunk, _encoding, done) { done(); } }),
    signal: AbortSignal.timeout(15_000),
  });
  return {
    async prepare({ material, initiator, approver }) {
      const template = await persistTemplate();
      const envelope = await runToolRequest({ filePath: template.filePath,
        args: { material: JSON.stringify(material) }, ctx: context({ initiator, approver }) });
      if (envelope.requiresApproval) envelope.requiresApproval.templateDigest = template.digest;
      return envelope;
    },
    async resume({ checkpoint, approve, actor }) {
      try { await verifyTemplate(checkpoint.templateDigest); }
      catch { return { ok: false, error: { type: 'runtime_error', message: 'Saved fixed workflow template missing or changed; no resume attempted' } }; }
      return resumeToolRequest({ token: checkpoint.resumeToken, approved: approve, ctx: context({ actor }) });
    },
  };
}
