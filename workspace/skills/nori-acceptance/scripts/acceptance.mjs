#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const VERSION = 1;
const JSON_LIMIT = 4 * 1024 * 1024;
const EVIDENCE_LIMIT = 32 * 1024 * 1024;
const PRODUCT_EVIDENCE = ['readback', 'product-output', 'screenshot', 'recording'];
const EVIDENCE_TYPES = [...PRODUCT_EVIDENCE, 'engineering'];
const VERDICTS = ['pass', 'fail', 'uncertain', 'blocked'];
const REPORT_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const ITEM_ID = /^[a-z][a-z0-9_-]{0,63}$/;
const SSH_NAMESPACE = 'nori-acceptance-v1';
const SSH_KEY_TYPE = /^(?:ssh-(?:ed25519|rsa)|ecdsa-sha2-nistp(?:256|384|521)|sk-(?:ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)$/;

function requireFact(condition, message) {
  if (!condition) throw new Error(message);
}

function nonempty(value, label, max = 4096) {
  requireFact(typeof value === 'string' && value.trim() && value.length <= max, `Invalid ${label}.`);
  return value;
}

function object(value, label) {
  requireFact(value && typeof value === 'object' && !Array.isArray(value), `Invalid ${label}.`);
  return value;
}

function uid() {
  requireFact(typeof process.geteuid === 'function', 'Acceptance requires POSIX user identities.');
  return process.geteuid();
}

function userId(value) {
  requireFact(Number.isInteger(value) && value >= 0 && value < 2 ** 32 - 1, 'Invalid reviewer UID.');
  return value;
}

function reviewerAssignment(input) {
  requireFact((input.reviewerUid === undefined) !== (input.reviewerSsh === undefined),
    'Assign one reviewer using a POSIX UID or an SSH signing public key.');
  if (input.reviewerUid !== undefined) {
    const reviewerUid = userId(input.reviewerUid);
    requireFact(reviewerUid !== uid(), 'Reviewer and executor must use distinct POSIX UIDs.');
    return { reviewerUid };
  }
  const { principal, publicKey } = object(input.reviewerSsh, 'SSH reviewer assignment');
  requireFact(typeof principal === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_@.-]{0,127}$/.test(principal),
    'Invalid SSH reviewer principal.');
  const [algorithm, key] = nonempty(publicKey, 'SSH public key', 8192).trim().split(/\s+/);
  requireFact(SSH_KEY_TYPE.test(algorithm) && /^[A-Za-z0-9+/]+={0,2}$/.test(key ?? ''),
    'Expected a supported OpenSSH public key.');
  return { reviewerSsh: { principal, publicKey: `${algorithm} ${key}` } };
}

function reviewerLabel(record) {
  return record.reviewerSsh?.principal ?? `UID ${record.reviewerUid}`;
}

function roundNumber(value) {
  const number = Number(value);
  requireFact(/^\d+$/.test(String(value)) && Number.isSafeInteger(number) && number > 0, 'Invalid round.');
  return number;
}

function jsonBytes(value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  requireFact(bytes.length <= JSON_LIMIT, 'Acceptance JSON exceeds the size limit.');
  return bytes;
}

export function readRegular(path, limit, validate = () => {}) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    requireFact(stat.isFile() && stat.size <= limit, 'Expected a bounded regular file.');
    validate(stat);
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, null);
      requireFact(count > 0, 'Input changed while it was read.');
      offset += count;
    }
    const after = fstatSync(fd);
    requireFact(
      stat.size === after.size && stat.mtimeMs === after.mtimeMs && stat.ctimeMs === after.ctimeMs,
      'Input changed while it was read.',
    );
    return { bytes, stat };
  } finally {
    closeSync(fd);
  }
}

function readJson(path) {
  return JSON.parse(readRegular(path, JSON_LIMIT).bytes.toString('utf8'));
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// Publishing a new name with a hard link is atomic and cannot replace an existing record.
function publish(path, bytes, mode = 0o400) {
  const temp = join(dirname(path), `.acceptance-${randomUUID()}`);
  const fd = openSync(temp, 'wx', mode);
  try {
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    linkSync(temp, path);
  } finally {
    unlinkSync(temp);
  }
}

function privateDirectory(path, create = false) {
  if (create) {
    try {
      mkdirSync(path, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  const info = lstatSync(path);
  requireFact(info.isDirectory() && info.uid === uid() && (info.mode & 0o077) === 0,
    'Acceptance storage must be an owner-only directory owned by the executor.');
  return path;
}

export function storeDirectory(path, create = false) {
  const target = resolve(path ?? join(homedir(), '.nori-acceptance'));
  const canonical = join(realpathSync(dirname(target)), basename(target));
  let ancestor = canonical;
  while (true) {
    requireFact(!existsSync(join(ancestor, '.git')), 'Keep the acceptance store outside Git worktrees.');
    const parent = dirname(ancestor);
    if (ancestor === parent) break;
    ancestor = parent;
  }
  return privateDirectory(canonical, create);
}

function reportDirectory(store, id) {
  requireFact(REPORT_ID.test(id ?? ''), 'Invalid report ID.');
  return privateDirectory(join(store, id));
}

function validatePlan(input) {
  object(input, 'plan');
  const reviewer = reviewerAssignment(input);
  const links = object(input.links, 'task links');
  const storedLinks = { task: nonempty(links.task, 'Task ID', 256) };
  for (const key of ['linear', 'github']) {
    if (links[key] !== undefined) storedLinks[key] = nonempty(links[key], `${key} issue reference`, 512);
  }
  requireFact(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 64,
    'Supply 1–64 acceptance items.');
  const itemIds = new Set();
  const items = input.items.map(item => {
    object(item, 'acceptance item');
    requireFact(typeof item.id === 'string' && ITEM_ID.test(item.id) && !itemIds.has(item.id),
      'Acceptance item IDs must be distinct safe identifiers.');
    itemIds.add(item.id);
    const requiredEvidence = item.requiredEvidence;
    requireFact(Array.isArray(requiredEvidence) && requiredEvidence.every(type => EVIDENCE_TYPES.includes(type)) &&
      new Set(requiredEvidence).size === requiredEvidence.length &&
      requiredEvidence.some(type => PRODUCT_EVIDENCE.includes(type)), 'Each item must require product evidence.');
    const planItem = {
      id: item.id,
      expected: nonempty(item.expected, 'expected product result'),
      environment: nonempty(item.environment, 'execution environment', 256),
      requiredEvidence,
    };
    if (item.check !== undefined) {
      object(item.check, 'local check');
      requireFact(item.check.kind === 'file-text-equals' && typeof item.check.path === 'string' &&
        isAbsolute(item.check.path) && typeof item.check.expected === 'string' &&
        Buffer.byteLength(item.check.expected) <= JSON_LIMIT && requiredEvidence.includes('readback'),
      'A file-text-equals check needs an absolute path, text to compare, and required readback evidence.');
      planItem.check = { kind: item.check.kind, path: item.check.path, expected: item.check.expected };
    }
    return planItem;
  });
  return {
    version: VERSION,
    reportId: randomUUID(),
    createdAt: new Date().toISOString(),
    objective: nonempty(input.objective, 'task objective'),
    links: storedLinks,
    identity: {
      requester: nonempty(input.requester, 'requester'),
      executor: { kind: 'local-os', uid: uid() },
      representedPrincipal: { kind: 'local-os', uid: uid() },
      credentialAccount: { kind: 'local-os', uid: uid() },
      resourceOwner: nonempty(input.resourceOwner, 'resource owner'),
      costAttribution: input.costAttribution === undefined
        ? 'unknown' : nonempty(input.costAttribution, 'cost attribution'),
      outputAudience: [{ uid: uid() }, reviewer.reviewerSsh
        ? { sshPrincipal: reviewer.reviewerSsh.principal } : { uid: reviewer.reviewerUid }],
    },
    ...reviewer,
    items,
  };
}

function start(store, input) {
  const plan = validatePlan(input);
  const directory = privateDirectory(join(store, plan.reportId), true);
  privateDirectory(join(directory, 'evidence'), true);
  publish(join(directory, 'plan.json'), jsonBytes(plan));
  return { reportId: plan.reportId, round: 1, status: 'pending_acceptance' };
}

function latestRound(directory) {
  const prepared = readdirSync(directory)
    .map(name => /^round-(\d+)-plan\.json$/.exec(name))
    .filter(Boolean)
    .map(match => roundNumber(match[1]));
  return Math.max(1, ...prepared);
}

function preparedRound(directory, plan, round) {
  if (round === 1) return { round, affected: plan.items.map(({ id }) => id) };
  return readJson(join(directory, `round-${round}-plan.json`));
}

function saveEvidence(directory, type, bytes) {
  const sha256 = digest(bytes);
  const path = join(privateDirectory(join(directory, 'evidence')), sha256);
  try {
    publish(path, bytes);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    requireFact(digest(readRegular(path, EVIDENCE_LIMIT).bytes) === sha256, 'Stored evidence failed its digest check.');
  }
  return { type, sha256, bytes: bytes.length };
}

function readEvidence(directory, sha256) {
  requireFact(DIGEST.test(sha256), 'Invalid evidence digest.');
  const path = join(privateDirectory(join(directory, 'evidence')), sha256);
  const { bytes } = readRegular(path, EVIDENCE_LIMIT);
  requireFact(digest(bytes) === sha256, 'Stored evidence failed its digest check.');
  return bytes;
}

function artifactEvidence(directory, evidence) {
  requireFact(Array.isArray(evidence) && evidence.length <= 16, 'Supply at most 16 evidence files per item.');
  return evidence.map(entry => {
    object(entry, 'evidence entry');
    requireFact(EVIDENCE_TYPES.includes(entry.type) && typeof entry.path === 'string' && isAbsolute(entry.path),
      'Evidence requires a supported type and an absolute local path.');
    return saveEvidence(directory, entry.type, readRegular(entry.path, EVIDENCE_LIMIT).bytes);
  });
}

function collectOutcome(directory, item, result) {
  const evidence = [];
  let verdict = 'uncertain';
  let observation = 'No observation was supplied for this item.';
  let limit;
  if (item.check) {
    requireFact(result === undefined || result.verdict === undefined && result.observation === undefined,
      'A built-in check determines its own verdict and observation.');
    let readback;
    try {
      readback = readRegular(item.check.path, EVIDENCE_LIMIT).bytes;
    } catch (error) {
      verdict = 'blocked';
      observation = 'The local product readback could not be obtained.';
      limit = error.code ?? error.message;
    }
    if (readback) {
      const matches = readback.equals(Buffer.from(item.check.expected));
      evidence.push(saveEvidence(directory, 'readback', readback));
      verdict = matches ? 'pass' : 'fail';
      observation = matches ? 'The local product readback matched the expected bytes.'
        : 'The local product readback differed from the expected bytes.';
    }
  } else if (result !== undefined) {
    requireFact(VERDICTS.includes(result.verdict), 'Invalid item verdict.');
    verdict = result.verdict;
    observation = nonempty(result.observation, 'observed product result');
  }
  if (result !== undefined) {
    evidence.push(...artifactEvidence(directory, result.evidence ?? []));
    if (result.limit !== undefined) limit = [limit, nonempty(result.limit, 'observation limit')].filter(Boolean).join(' ');
  }
  const missingEvidence = item.requiredEvidence.filter(type =>
    !evidence.some(entry => entry.type === type && entry.bytes > 0));
  // An empty readback can itself be the product result when directly measured by the collector.
  if (item.check && evidence[0]?.type === 'readback') {
    const index = missingEvidence.indexOf('readback');
    if (index !== -1) missingEvidence.splice(index, 1);
  }
  if (missingEvidence.length && (verdict === 'pass' || verdict === 'fail')) verdict = 'uncertain';
  return { verdict, observation, limit: limit ?? null, missingEvidence, evidence };
}

function roundPacket(directory, round) {
  const path = join(directory, `round-${round}.json`);
  const { bytes } = readRegular(path, JSON_LIMIT);
  return { bytes, packet: JSON.parse(bytes.toString('utf8')), sha256: digest(bytes) };
}

function record(directory, plan, round, input) {
  const prepared = preparedRound(directory, plan, round);
  requireFact(round === latestRound(directory), 'Record results for the latest prepared round.');
  requireFact(!existsSync(join(directory, `round-${round}.json`)), 'This round already has immutable results.');
  const supplied = object(input, 'item results');
  for (const [id, result] of Object.entries(supplied)) {
    requireFact(prepared.affected.includes(id), 'Results may only contain affected items.');
    object(result, 'item result');
  }
  const prior = prepared.fromRound ? roundPacket(directory, prepared.fromRound).packet : undefined;
  const items = plan.items.map(item => {
    const { check, ...criterion } = item;
    if (!prepared.affected.includes(item.id)) {
      const previous = prior.items.find(entry => entry.id === item.id);
      return { ...previous, reusedFromRound: prepared.fromRound };
    }
    return {
      ...criterion,
      collection: check?.kind ?? 'operator-observed',
      evaluatedRound: round,
      reusedFromRound: null,
      ...collectOutcome(directory, item, Object.hasOwn(supplied, item.id) ? supplied[item.id] : undefined),
    };
  });
  const { items: _plannedItems, ...metadata } = plan;
  const packet = {
    ...metadata,
    ...prepared,
    recordedAt: new Date().toISOString(),
    executionStatus: items.every(item => item.verdict === 'pass') ? 'passed' : 'pending_acceptance',
    items,
  };
  const bytes = jsonBytes(packet);
  publish(join(directory, `round-${round}.json`), bytes);
  return { reportId: plan.reportId, round, executionStatus: packet.executionStatus, sha256: digest(bytes) };
}

function feedbackFile(directory, round) {
  return join(directory, `round-${round}-feedback.json`);
}

function priorFeedback(directory, plan, report) {
  const path = feedbackFile(directory, report.packet.round);
  if (!existsSync(path)) return null;
  const feedback = readJson(path);
  requireFact(feedback.reportId === plan.reportId && feedback.round === report.packet.round &&
    feedback.roundDigest === report.sha256, 'Stored feedback does not match the immutable report round.');
  if (plan.reviewerSsh) {
    const { receipt, signature } = feedback.signedReceipt;
    requireFact(receipt.reportId === feedback.reportId && receipt.round === feedback.round &&
      receipt.roundDigest === feedback.roundDigest && receipt.decision === feedback.decision &&
      receipt.note === feedback.note && JSON.stringify(receipt.affected) === JSON.stringify(feedback.affected),
    'Stored feedback does not match the signed receipt.');
    verifySignature(plan.reviewerSsh, receipt, signature);
  } else {
    requireFact(feedback.reviewerUid === plan.reviewerUid, 'Stored feedback reviewer mismatch.');
  }
  return feedback;
}

function rerun(directory, plan, round, affected, change) {
  requireFact(round === latestRound(directory), 'Base a rerun on the latest prepared round.');
  const report = roundPacket(directory, round);
  const { packet, sha256 } = report;
  const feedback = priorFeedback(directory, plan, report);
  const rerunItems = [...new Set([...affected, ...(feedback?.affected ?? [])])];
  requireFact(rerunItems.length > 0 && rerunItems.every(id => plan.items.some(item => item.id === id)),
    'Select existing affected items for the rerun.');
  const prepared = {
    round: round + 1,
    fromRound: round,
    fromDigest: sha256,
    change: nonempty(change, 'fix or change reference'),
    feedbackDigest: feedback === null ? null : digest(jsonBytes(feedback)),
    affected: packet.items.map(item => item.id).filter(id => rerunItems.includes(id)),
  };
  publish(join(directory, `round-${prepared.round}-plan.json`), jsonBytes(prepared));
  return { reportId: plan.reportId, round: prepared.round, affected: prepared.affected, status: 'pending_acceptance' };
}

function feedbackFields(packet, decision, input) {
  object(input, 'reviewer feedback');
  requireFact(decision === 'accept' || decision === 'return', 'Review decision must be accept or return.');
  const affected = input.affected ?? [];
  requireFact(Array.isArray(affected) && new Set(affected).size === affected.length &&
    affected.every(id => packet.items.some(item => item.id === id)), 'Invalid affected items in feedback.');
  if (decision === 'accept') {
    requireFact(packet.executionStatus === 'passed' && affected.length === 0,
      'Only a passing round with no affected items can be accepted.');
  } else {
    requireFact(affected.length > 0, 'A return must identify affected items.');
  }
  return { decision, note: nonempty(input.note, 'review feedback'), affected };
}

function sshKeygen(args, input) {
  return spawnSync('/usr/bin/ssh-keygen', args, { input, timeout: 120_000, maxBuffer: JSON_LIMIT });
}

function verifySignature(assignment, receipt, signature) {
  requireFact(receipt.reviewerPrincipal === assignment.principal && typeof signature === 'string' &&
    signature.startsWith('-----BEGIN SSH SIGNATURE-----\n'), 'Receipt requires the assigned reviewer signature.');
  const directory = mkdtempSync(join(tmpdir(), 'nori-acceptance-signature-'));
  try {
    const signers = join(directory, 'allowed-signers');
    const signaturePath = join(directory, 'receipt.sig');
    writeFileSync(signers, `${assignment.principal} ${assignment.publicKey}\n`, { mode: 0o600 });
    writeFileSync(signaturePath, signature, { mode: 0o600 });
    const result = sshKeygen(
      ['-Y', 'verify', '-f', signers, '-I', assignment.principal, '-n', SSH_NAMESPACE, '-s', signaturePath],
      jsonBytes(receipt),
    );
    requireFact(result.status === 0, 'Receipt signature failed verification against the assigned reviewer key.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function review(packetPath, decision, input, receiptPath, signingKey) {
  const { bytes } = readRegular(packetPath, JSON_LIMIT);
  const packet = JSON.parse(bytes.toString('utf8'));
  requireFact(packet.version === VERSION && REPORT_ID.test(packet.reportId) && Array.isArray(packet.items),
    'Invalid acceptance packet.');
  const assignment = packet.reviewerSsh ? reviewerAssignment(packet).reviewerSsh : null;
  if (assignment) {
    requireFact(signingKey && isAbsolute(signingKey), 'Provide the assigned reviewer signing key using --signing-key.');
  } else {
    requireFact(!signingKey && packet.identity?.executor?.uid !== uid() && packet.reviewerUid === uid(),
      'The current POSIX principal is not the assigned independent reviewer.');
  }
  const receipt = {
    version: VERSION,
    reportId: packet.reportId,
    round: roundNumber(packet.round),
    roundDigest: digest(bytes),
    ...(assignment ? { reviewerPrincipal: assignment.principal } : { reviewerUid: uid() }),
    reviewedAt: new Date().toISOString(),
    ...feedbackFields(packet, decision, input),
  };
  let envelope = receipt;
  if (assignment) {
    const result = sshKeygen(['-Y', 'sign', '-f', signingKey, '-n', SSH_NAMESPACE], jsonBytes(receipt));
    requireFact(result.status === 0, 'Unable to sign with the supplied SSH key or ssh-agent.');
    const signature = result.stdout.toString('utf8');
    verifySignature(assignment, receipt, signature);
    envelope = { receipt, signature };
  }
  publish(receiptPath, jsonBytes(envelope));
  return { reportId: receipt.reportId, round: receipt.round, decision, receiptPath };
}

function ingestReview(directory, plan, path) {
  const { bytes, stat } = readRegular(path, JSON_LIMIT, info => {
    if (!plan.reviewerSsh) {
      requireFact(info.uid === plan.reviewerUid && info.uid !== uid() && (info.mode & 0o022) === 0,
        'Receipt must be owned by the assigned reviewer and unwritable by other principals.');
    }
  });
  const envelope = object(JSON.parse(bytes.toString('utf8')), 'review receipt');
  const receipt = plan.reviewerSsh ? object(envelope.receipt, 'signed receipt') : envelope;
  const round = roundNumber(receipt.round);
  const report = roundPacket(directory, round);
  const { packet, sha256 } = report;
  requireFact(receipt.version === VERSION && receipt.reportId === plan.reportId && receipt.roundDigest === sha256,
    'Receipt does not match the immutable report round.');
  if (plan.reviewerSsh) {
    verifySignature(plan.reviewerSsh, receipt, envelope.signature);
  } else {
    requireFact(receipt.reviewerUid === stat.uid, 'Receipt does not match the authenticated reviewer.');
  }
  const feedback = {
    reportId: plan.reportId,
    round,
    roundDigest: sha256,
    ...(plan.reviewerSsh ? { reviewerSsh: plan.reviewerSsh, signedReceipt: envelope } : { reviewerUid: stat.uid }),
    recordedAt: new Date().toISOString(),
    ...feedbackFields(packet, receipt.decision, receipt),
  };
  const destination = feedbackFile(directory, round);
  try {
    publish(destination, jsonBytes(feedback));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = priorFeedback(directory, plan, report);
    requireFact(reviewerLabel(existing) === reviewerLabel(feedback) && existing.roundDigest === feedback.roundDigest &&
      existing.decision === feedback.decision && existing.note === feedback.note &&
      JSON.stringify(existing.affected) === JSON.stringify(feedback.affected), 'This round already has different feedback.');
  }
  return { reportId: plan.reportId, round, reviewStatus: feedback.decision === 'accept' ? 'accepted' : 'returned' };
}

function safeReportText(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ');
}

function show(directory, plan, round, format) {
  requireFact([undefined, 'text', 'json', 'packet'].includes(format), 'Invalid report format.');
  if (!existsSync(join(directory, `round-${round}.json`))) {
    const prepared = preparedRound(directory, plan, round);
    requireFact(format !== 'packet', 'Record the round before preparing a review packet.');
    const pending = {
      reportId: plan.reportId, links: plan.links, ...prepared,
      executionStatus: 'pending_acceptance', reviewStatus: 'awaiting_results',
    };
    if (format === 'json') return jsonBytes(pending);
    return `Acceptance report ${plan.reportId} · Round ${round}\nAwaiting results for ${prepared.affected.join(', ')}.\n`;
  }
  const report = roundPacket(directory, round);
  const { bytes, packet, sha256 } = report;
  if (format === 'packet') return bytes;
  const feedback = priorFeedback(directory, plan, report);
  const reviewStatus = feedback?.decision === 'accept' ? 'accepted' : feedback?.decision === 'return' ? 'returned'
    : 'awaiting_review';
  if (format === 'json') return jsonBytes({ ...packet, sha256, reviewStatus, feedback });
  const lines = [
    `Acceptance report ${packet.reportId} · Round ${round}`,
    safeReportText(packet.objective),
    '',
    ...Object.entries(packet.links).map(([kind, ref]) => `${kind} ${safeReportText(ref)}`),
    `Execution ${packet.executionStatus} · Review ${reviewStatus} · Reviewer ${reviewerLabel(packet)}`,
    `Recorded ${packet.recordedAt} · SHA-256 ${sha256}`,
  ];
  if (packet.change) lines.push(`Change from round ${packet.fromRound} · ${safeReportText(packet.change)}`);
  for (const item of packet.items) {
    lines.push('', `${item.id} · ${item.verdict}`, `Expected ${safeReportText(item.expected)}`,
      `Environment ${safeReportText(item.environment)}`, `Observed ${safeReportText(item.observation)}`);
    if (item.reusedFromRound) lines.push(`Evidence reused from round ${item.reusedFromRound}`);
    if (item.limit) lines.push(`Limit ${safeReportText(item.limit)}`);
    if (item.missingEvidence.length) lines.push(`Missing evidence ${item.missingEvidence.join(', ')}`);
    for (const file of item.evidence) lines.push(`Evidence ${file.type} ${file.sha256} (${file.bytes} bytes)`);
  }
  if (feedback) {
    lines.push('', `Reviewer ${reviewerLabel(feedback)} · ${reviewStatus}`, safeReportText(feedback.note));
    if (feedback.affected.length) lines.push(`Affected ${feedback.affected.join(', ')}`);
  }
  return lines.join('\n') + '\n';
}

export function readAcceptanceReport({ store, reportId, round }) {
  const directory = reportDirectory(storeDirectory(store), reportId);
  const plan = readJson(join(directory, 'plan.json'));
  requireFact(plan.reportId === reportId && plan.identity.executor.uid === uid(), 'Report owner mismatch.');
  return JSON.parse(show(directory, plan, roundNumber(round), 'json'));
}

const help = `Nori Acceptance
  start --plan FILE [--store DIR]
  record --report ID --round NUMBER [--results FILE] [--store DIR]
  show --report ID [--round NUMBER] [--format text|json|packet] [--store DIR]
  artifact --report ID --round NUMBER --digest SHA256 [--store DIR]
  review --packet FILE --decision accept|return --feedback FILE --receipt FILE [--signing-key FILE]
  ingest-review --report ID --receipt FILE [--store DIR]
  rerun --report ID --from NUMBER --change REFERENCE [--affected ITEM ...] [--store DIR]
`;

const commandArgs = {
  start: { required: ['plan'], optional: ['store'] },
  record: { required: ['report', 'round'], optional: ['results', 'store'] },
  show: { required: ['report'], optional: ['round', 'format', 'store'] },
  artifact: { required: ['report', 'round', 'digest'], optional: ['store'] },
  review: { required: ['packet', 'decision', 'feedback', 'receipt'], optional: ['signing-key'] },
  'ingest-review': { required: ['report', 'receipt'], optional: ['store'] },
  rerun: { required: ['report', 'from', 'change'], optional: ['affected', 'store'] },
};

function main([command, ...args]) {
  if (command === undefined || command === '--help' || command === 'help') return help;
  const spec = Object.hasOwn(commandArgs, command) ? commandArgs[command] : null;
  requireFact(spec, 'Unknown command. Run acceptance.mjs --help.');
  const options = Object.fromEntries([...spec.required, ...spec.optional].map(key =>
    [key, key === 'affected' ? { type: 'string', multiple: true } : { type: 'string' }]));
  const { values } = parseArgs({ args, options });
  for (const field of spec.required) nonempty(values[field], `--${field}`);
  if (command === 'review') {
    return jsonBytes(review(values.packet, values.decision, readJson(values.feedback), values.receipt, values['signing-key']));
  }
  const store = storeDirectory(values.store, command === 'start');
  if (command === 'start') return jsonBytes(start(store, readJson(values.plan)));
  const directory = reportDirectory(store, values.report);
  const plan = readJson(join(directory, 'plan.json'));
  requireFact(plan.reportId === values.report && plan.identity.executor.uid === uid(), 'Report owner mismatch.');
  if (command === 'ingest-review') return jsonBytes(ingestReview(directory, plan, values.receipt));
  if (command === 'rerun') {
    return jsonBytes(rerun(directory, plan, roundNumber(values.from), values.affected ?? [], values.change));
  }
  const round = values.round === undefined ? latestRound(directory) : roundNumber(values.round);
  if (command === 'show') return show(directory, plan, round, values.format);
  if (command === 'artifact') {
    const { packet } = roundPacket(directory, round);
    requireFact(packet.items.some(item => item.evidence.some(entry => entry.sha256 === values.digest)),
      'Evidence digest is absent from the specified report round.');
    return readEvidence(directory, values.digest);
  }
  return jsonBytes(record(directory, plan, round, values.results === undefined ? {} : readJson(values.results)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(main(process.argv.slice(2)));
  } catch (error) {
    const message = error.code ?? error.message;
    process.stderr.write(`Acceptance: ${safeReportText(message)}\n`);
    process.exitCode = 1;
  }
}
