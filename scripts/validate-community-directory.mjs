import assert from 'node:assert/strict';
import { BlockList, isIP } from 'node:net';

// IANA special-purpose registries (2025-10-09 snapshots): non-global,
// deprecated and documentation prefixes are unsuitable public web destinations.
// https://www.iana.org/assignments/iana-ipv4-special-registry/
// https://www.iana.org/assignments/iana-ipv6-special-registry/
const PRIVATE_NETWORKS = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) {
  PRIVATE_NETWORKS.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [['::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['100:0:0:1::', 64], ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20], ['5f00::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]]) {
  PRIVATE_NETWORKS.addSubnet(address, prefix, 'ipv6');
}
const GLOBAL_EXCEPTIONS = new BlockList();
for (const address of ['192.0.0.9', '192.0.0.10']) GLOBAL_EXCEPTIONS.addAddress(address, 'ipv4');
for (const [address,prefix] of [['2001:1::1',128],['2001:1::2',128],['2001:1::3',128],['2001:3::',32],['2001:4:112::',48],['2001:20::',28],['2001:30::',28]]) GLOBAL_EXCEPTIONS.addSubnet(address,prefix,'ipv6');

const ENTRYPOINTS = ['introductions', 'discussion', 'courses', 'events', 'contributions', 'help', 'contributorApplication'];
const COMMON = ['title', 'url', 'sourceUrl', 'topics', 'audience', 'status', 'verifiedAt'];
const COLLECTIONS = {
  discussions: { fields: ['language'], statuses: ['open', 'closed', 'archived'] },
  resources: { fields: ['kind', 'language', 'level', 'duration', 'summary', 'firstStep', 'isFree'], statuses: ['published', 'archived', 'withdrawn'] },
  events: { fields: ['registrationUrl', 'city', 'venue', 'startsAt', 'endsAt', 'timezone', 'mode', 'cost', 'registrationStatus'], statuses: ['scheduled', 'postponed', 'cancelled', 'completed'] },
  contributionOpportunities: { fields: ['kind', 'timeEstimate', 'firstStep'], statuses: ['open', 'closed', 'archived'] },
};
const DISCORD_HOSTS = new Set(['discord.com', 'www.discord.com', 'canary.discord.com', 'ptb.discord.com', 'discordapp.com', 'www.discordapp.com']);
const PLACEHOLDER = /FIXTURE_|^演练[:：]|^合成课程[:：]|[（(]合成(?:数据|章节)[）)]|^合成城市$|^合成公共学习空间$|^(?:TODO|TBD|PLACEHOLDER)$/i;

function object(value, path, fields) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`);
  for (const field of fields) assert.ok(Object.hasOwn(value, field), `${path}.${field} is required (use null where allowed)`);
  for (const field of Object.keys(value)) assert.ok(fields.includes(field), `${path}.${field} is not a documented field`);
}

function text(value, path, nullable = false) {
  if (nullable && value === null) return;
  assert.ok(typeof value === 'string' && value.trim() && value === value.trim(), `${path} must be nonempty text${nullable ? ' or null' : ''}`);
}

function choice(value, allowed, path) {
  assert.ok(allowed.includes(value), `${path} has an unsupported value`);
}

function snowflake(value, path) {
  assert.ok(typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= (1n << 64n) - 1n, `${path} must be a decimal Discord snowflake ID`);
}

function noPlaceholders(value, path) {
  if (typeof value === 'string') assert.ok(!PLACEHOLDER.test(value), `${path} contains a rehearsal placeholder`);
  else if (Array.isArray(value)) value.forEach((item, index) => noPlaceholders(item, `${path}[${index}]`));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) noPlaceholders(item, `${path}.${key}`);
  }
}

function httpsUrl(value, path, guildId, fixture) {
  text(value, path);
  let url;
  try { url = new URL(value); } catch { assert.fail(`${path} must be a complete HTTPS URL`); }
  assert.ok(value.startsWith('https://') && url.protocol === 'https:' && !url.username && !url.password, `${path} must be a complete HTTPS URL without credentials`);
  if (fixture) {
    assert.equal(url.hostname, 'example.invalid', `${path} fixture URL must use example.invalid`);
    return;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const reserved = ['example.com', 'example.net', 'example.org', 'invalid', 'test', 'example', 'localhost', 'local', 'internal', 'lan', 'home', 'home.arpa'];
  assert.ok(!reserved.some(domain => host === domain || host.endsWith(`.${domain}`)), `${path} must not use an example or local hostname`);
  const address = host.replace(/^\[|\]$/g, '');
  const family = isIP(address);
  const type = family === 4 ? 'ipv4' : 'ipv6';
  const mapped = family === 6 && address.startsWith('::ffff:');
  const validDns = host.length <= 253 && host.includes('.') && host.split('.').every(label =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  assert.ok(!mapped && (family ? GLOBAL_EXCEPTIONS.check(address,type) || !PRIVATE_NETWORKS.check(address,type) : validDns), `${path} must use a public-network hostname`);
  // Fail closed on any encoded Discord path component: one decode is not
  // enough for nested escapes or encoded separators and invite aliases.
  const discordHost = DISCORD_HOSTS.has(host) || host === 'discord.gg' || /(?:^|\.)discord(?:app)?\.com$/.test(host);
  if (discordHost) assert.ok(!url.pathname.includes('%'), `${path} must not use encoded Discord path components`);
  if (DISCORD_HOSTS.has(host) && /^\/channels(?:\/|$)/.test(url.pathname)) {
    const [, , server, channel, message, ...rest] = url.pathname.replace(/\/$/, '').split('/');
    assert.equal(server, guildId, `${path} Discord channel must belong to the same guild`);
    snowflake(channel, `${path} channel ID`);
    if (message !== undefined) snowflake(message, `${path} message ID`);
    assert.equal(rest.length, 0, `${path} has a malformed Discord channel path`);
  }
  if (DISCORD_HOSTS.has(host) && /^\/events(?:\/|$)/.test(url.pathname)) {
    const [, , server, event, ...rest] = url.pathname.replace(/\/$/, '').split('/');
    assert.equal(server, guildId, `${path} Discord event must belong to the same guild`);
    snowflake(event, `${path} event ID`);
    assert.equal(rest.length, 0, `${path} has a malformed Discord event path`);
  }
  assert.ok(host !== 'discord.gg' && !(/(?:^|\.)discord(?:app)?\.com$/.test(host) && /^\/invite(?:\/|$)/.test(url.pathname)), `${path} must use a public entry point rather than an invitation`);
}

function timestamp(value, path) {
  text(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  assert.ok(match, `${path} must be an ISO timestamp with a UTC offset`);
  const [y, m, d] = match.slice(1).map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  assert.ok(m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1] && Number.isFinite(Date.parse(value)), `${path} must be a real calendar timestamp`);
  return Date.parse(value);
}

function eventTimes(entry, path) {
  const start = timestamp(entry.startsAt, `${path}.startsAt`);
  const end = entry.endsAt === null ? null : timestamp(entry.endsAt, `${path}.endsAt`);
  assert.ok(end === null || end > start, `${path}.endsAt must be later than startsAt`);
  text(entry.timezone, `${path}.timezone`);
  assert.ok(!/^[+-]/.test(entry.timezone), `${path}.timezone must be an IANA timezone, not a fixed offset`);
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en', { timeZone: entry.timezone, timeZoneName: 'longOffset' }); }
  catch { assert.fail(`${path}.timezone must be an IANA timezone`); }
  for (const field of ['startsAt', 'endsAt']) {
    if (entry[field] === null) continue;
    const actual = formatter.formatToParts(new Date(entry[field])).find(part => part.type === 'timeZoneName').value;
    const expected = entry[field].endsWith('Z') ? '+00:00' : entry[field].slice(-6).replace('-00:00', '+00:00');
    assert.equal(actual === 'GMT' ? '+00:00' : actual.replace(/^GMT/, ''), expected, `${path}.${field} UTC offset must match timezone`);
  }
}

function entry(value, path, collection, guildId, fixture) {
  const schema = COLLECTIONS[collection];
  object(value, path, [...COMMON, ...schema.fields]);
  text(value.title, `${path}.title`);
  assert.equal(value.audience, 'public', `${path}.audience must be public`);
  choice(value.status, schema.statuses, `${path}.status`);
  timestamp(value.verifiedAt, `${path}.verifiedAt`);
  for (const field of ['url', 'sourceUrl']) httpsUrl(value[field], `${path}.${field}`, guildId, fixture);
  assert.ok(Array.isArray(value.topics), `${path}.topics must be an array`);
  value.topics.forEach((topic, index) => text(topic, `${path}.topics[${index}]`));
  if (collection === 'events') {
    if (value.registrationUrl !== null) httpsUrl(value.registrationUrl, `${path}.registrationUrl`, guildId, fixture);
    choice(value.mode, ['offline', 'online', 'hybrid'], `${path}.mode`);
    choice(value.registrationStatus, ['open', 'full', 'closed', 'not-required', null], `${path}.registrationStatus`);
    for (const field of ['city', 'venue', 'cost']) text(value[field], `${path}.${field}`, true);
    if (value.mode !== 'online') text(value.city, `${path}.city`);
    eventTimes(value, path);
  } else {
    for (const field of schema.fields.filter(field => field !== 'isFree')) {
      text(value[field], `${path}.${field}`, !['kind', 'summary'].includes(field));
    }
    if (collection === 'resources') assert.ok(value.isFree === null || typeof value.isFree === 'boolean', `${path}.isFree must be boolean or null`);
  }
}

// Structural validation only: no fetch, public-access verification or runtime enforcement.
export function validateCommunityDirectory(directory, { allowFixture = false } = {}) {
  object(directory, 'directory', ['version', 'status', 'guilds']);
  assert.equal(directory.version, 1, 'directory.version must be 1');
  choice(directory.status, allowFixture ? ['unconfigured', 'active', 'fixture'] : ['unconfigured', 'active'], 'directory.status');
  assert.ok(Array.isArray(directory.guilds), 'directory.guilds must be an array');
  if (directory.status === 'unconfigured') {
    assert.equal(directory.guilds.length, 0, 'unconfigured directory.guilds must be empty');
    return;
  }
  const fixture = directory.status === 'fixture';
  if (!fixture) noPlaceholders(directory, 'directory');
  assert.ok(directory.guilds.length > 0, 'active/fixture directory.guilds must not be empty');
  const seen = new Set();
  directory.guilds.forEach((guild, index) => {
    const path = `directory.guilds[${index}]`;
    object(guild, path, ['guildId', 'entrypoints', ...Object.keys(COLLECTIONS)]);
    if (fixture) {
      assert.ok(typeof guild.guildId === 'string' && /^FIXTURE_[A-Z0-9_]+$/.test(guild.guildId), `${path}.guildId must be a fixture ID`);
    } else snowflake(guild.guildId, `${path}.guildId`);
    assert.ok(!seen.has(guild.guildId), `${path}.guildId must be unique`);
    seen.add(guild.guildId);
    object(guild.entrypoints, `${path}.entrypoints`, ENTRYPOINTS);
    for (const name of ENTRYPOINTS) {
      const point = guild.entrypoints[name];
      if (point === null) continue;
      const pointPath = `${path}.entrypoints.${name}`;
      object(point, pointPath, ['label', 'url', 'audience', 'verifiedAt']);
      text(point.label, `${pointPath}.label`);
      assert.equal(point.audience, 'public', `${pointPath}.audience must be public`);
      httpsUrl(point.url, `${pointPath}.url`, guild.guildId, fixture);
      timestamp(point.verifiedAt, `${pointPath}.verifiedAt`);
    }
    for (const collection of Object.keys(COLLECTIONS)) {
      assert.ok(Array.isArray(guild[collection]), `${path}.${collection} must be an array`);
      guild[collection].forEach((item, itemIndex) => entry(item, `${path}.${collection}[${itemIndex}]`, collection, guild.guildId, fixture));
    }
  });
}
