import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCommunityDirectory } from '../scripts/validate-community-directory.mjs';

const fixture = JSON.parse(readFileSync(new URL('../templates/discord-community-directory.example.json', import.meta.url), 'utf8'));
const GUILD = '111111111111111111';
const OTHER_GUILD = '222222222222222222';
const CHANNEL = '333333333333333333';
const VERIFIED = '2030-05-01T00:00:00Z';
const COLLECTIONS = ['discussions', 'resources', 'events', 'contributionOpportunities'];
const ENTRYPOINTS = ['introductions', 'discussion', 'courses', 'events', 'contributions', 'help', 'contributorApplication'];

// Synthetic schema-test data only. IDs and URLs are never fetched or installed in the runtime directory.
function activeDirectory() {
  const url = path => `https://catalog.validation-only.org/${path}`;
  const common = (title, status) => ({
    title, status, url: url(title), sourceUrl: url('source'), topics: ['AI Agent'],
    audience: 'public', verifiedAt: VERIFIED,
  });
  return {
    version: 1, status: 'active', guilds: [{
      guildId: GUILD,
      entrypoints: Object.fromEntries(ENTRYPOINTS.map(name => [name, {
        label: name, url: url(name), audience: 'public', verifiedAt: VERIFIED,
      }])),
      discussions: [{ ...common('discussion', 'open'), language: 'zh' }],
      resources: [{
        ...common('course', 'published'), kind: 'course', language: 'zh', level: 'beginner',
        duration: 'First lesson: 20 minutes', summary: 'An introduction to tools.',
        firstStep: 'Read the course outline.', isFree: true,
      }],
      events: [{
        ...common('meetup', 'scheduled'), registrationUrl: url('register'), city: 'Test City',
        venue: null, startsAt: '2030-05-18T14:00:00-07:00', endsAt: '2030-05-18T16:00:00-07:00',
        timezone: 'America/Los_Angeles', mode: 'offline', cost: null, registrationStatus: 'open',
      }],
      contributionOpportunities: [{
        ...common('notes', 'open'), kind: 'notes', timeEstimate: null, firstStep: 'Write one note.',
      }],
    }],
  };
}

test('unconfigured directories are empty; runtime validation never enables fixture mode', () => {
  const runtime = JSON.parse(readFileSync(new URL('../workspace/community-directory.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateCommunityDirectory({ version: 1, status: 'unconfigured', guilds: [] }));
  assert.doesNotThrow(() => validateCommunityDirectory(runtime));
  assert.throws(() => validateCommunityDirectory(fixture), /directory.status/);
  assert.doesNotThrow(() => validateCommunityDirectory(fixture, { allowFixture: true }));
});

test('active public entries validate without being fetched or modified', () => {
  const directory = activeDirectory();
  const before = structuredClone(directory);
  validateCommunityDirectory(directory);
  assert.deepEqual(directory, before);
  directory.guilds.push({ ...structuredClone(directory.guilds[0]), guildId: OTHER_GUILD });
  assert.doesNotThrow(() => validateCommunityDirectory(directory));
});

test('unknown metadata stays null, missing entry points stay null and collections may be empty', () => {
  const directory = activeDirectory();
  const guild = directory.guilds[0];
  for (const name of ENTRYPOINTS) guild.entrypoints[name] = null;
  guild.discussions[0].language = null;
  for (const field of ['language', 'level', 'duration', 'firstStep', 'isFree']) guild.resources[0][field] = null;
  guild.contributionOpportunities[0].firstStep = null;
  Object.assign(guild.events[0], { mode: 'online', city: null, endsAt: null, registrationUrl: null, registrationStatus: null });
  assert.doesNotThrow(() => validateCommunityDirectory(directory));
  for (const name of COLLECTIONS) guild[name] = [];
  assert.doesNotThrow(() => validateCommunityDirectory(directory));
});

test('changing a copied fixture to active is rejected, even when fixture mode is allowed', () => {
  const directory = structuredClone(fixture);
  directory.status = 'active';
  for (const options of [{}, { allowFixture: true }]) {
    assert.throws(() => validateCommunityDirectory(directory, options), /rehearsal placeholder/);
  }
  directory.guilds[0].guildId = GUILD;
  assert.throws(() => validateCommunityDirectory(directory), /rehearsal placeholder/);
});

const invalidDirectories = [
  ['empty active guilds', d => { d.guilds = []; }, /must not be empty/],
  ['nonempty unconfigured guilds', d => { d.status = 'unconfigured'; }, /must be empty/],
  ['duplicate guild IDs', d => { d.guilds.push(structuredClone(d.guilds[0])); }, /must be unique/],
  ['malformed guild ID', d => { d.guilds[0].guildId = 'OTHER_GUILD'; }, /snowflake/],
  ['overflowing guild ID', d => { d.guilds[0].guildId = '18446744073709551616'; }, /snowflake/],
  ['numeric guild ID', d => { d.guilds[0].guildId = Number(GUILD); }, /snowflake/],
  ['missing directory version', d => { delete d.version; }, /version is required/],
  ['unsupported directory version', d => { d.version = 2; }, /version must be 1/],
  ['unknown directory state', d => { d.status = 'ready'; }, /unsupported value/],
  ['guilds object', d => { d.guilds = {}; }, /guilds must be an array/],
  ['null guild', d => { d.guilds[0] = null; }, /must be an object/],
  ['missing collection', d => { delete d.guilds[0].resources; }, /resources is required/],
  ['missing entry point', d => { delete d.guilds[0].entrypoints.help; }, /help is required/],
  ['extra member data', d => { d.guilds[0].members = []; }, /not a documented field/],
  ['entry point without audience', d => { delete d.guilds[0].entrypoints.help.audience; }, /audience is required/],
  ['private entry point', d => { d.guilds[0].entrypoints.help.audience = 'private'; }, /audience must be public/],
  ['empty entry point label', d => { d.guilds[0].entrypoints.help.label = ''; }, /nonempty text/],
  ['fixture label', d => { d.guilds[0].entrypoints.help.label = '演练：公开帮助'; }, /rehearsal placeholder/],
  ['fixture metadata', d => { d.guilds[0].resources[0].duration = '第一节约 20 分钟（合成数据）'; }, /rehearsal placeholder/],
  ['malformed topic', d => { d.guilds[0].resources[0].topics = [42]; }, /nonempty text/],
  ['missing summary', d => { delete d.guilds[0].resources[0].summary; }, /summary is required/],
  ['invalid free flag', d => { d.guilds[0].resources[0].isFree = 'true'; }, /boolean or null/],
  ['invalid first step', d => { d.guilds[0].resources[0].firstStep = {}; }, /nonempty text/],
  ['invalid verification date', d => { d.guilds[0].resources[0].verifiedAt = '2030-02-30T00:00:00Z'; }, /real calendar/],
  ['date without offset', d => { d.guilds[0].entrypoints.help.verifiedAt = '2030-05-01T00:00:00'; }, /UTC offset/],
  ['missing event start', d => { d.guilds[0].events[0].startsAt = null; }, /nonempty text/],
  ['event end before start', d => { d.guilds[0].events[0].endsAt = '2030-05-18T13:00:00-07:00'; }, /later than/],
  ['invalid timezone', d => { d.guilds[0].events[0].timezone = 'Unknown/City'; }, /IANA timezone/],
  ['fixed-offset timezone', d => { d.guilds[0].events[0].timezone = '-07:00'; }, /IANA timezone/],
  ['timezone offset mismatch', d => { d.guilds[0].events[0].startsAt = '2030-05-18T14:00:00-08:00'; }, /offset must match/],
  ['unknown offline city', d => { d.guilds[0].events[0].city = null; }, /city must be nonempty text/],
  ['unknown event mode', d => { d.guilds[0].events[0].mode = 'in-person'; }, /unsupported value/],
  ['invalid registration status', d => { d.guilds[0].events[0].registrationStatus = 'maybe'; }, /unsupported value/],
];

for (const [name, mutate, expected] of invalidDirectories) {
  test(`reject ${name}`, () => {
    const directory = activeDirectory();
    mutate(directory);
    assert.throws(() => validateCommunityDirectory(directory), expected);
  });
}

for (const collection of COLLECTIONS) {
  test(`${collection}: reject malformed, private and invalid-state entries`, () => {
    for (const [mutate, expected] of [
      [g => { g[collection] = {}; }, /must be an array/],
      [g => { g[collection][0] = null; }, /must be an object/],
      [g => { g[collection][0].audience = 'contributors'; }, /audience must be public/],
      [g => { g[collection][0].status = 'unknown'; }, /unsupported value/],
      [g => { g[collection][0].topics = 'AI Agent'; }, /topics must be an array/],
      [g => { g[collection][0].privateNotes = 'internal'; }, /not a documented field/],
    ]) {
      const directory = activeDirectory();
      mutate(directory.guilds[0]);
      assert.throws(() => validateCommunityDirectory(directory), expected);
    }
  });
}

const urlLocations = [
  g => [g.entrypoints.help, 'url'],
  ...COLLECTIONS.flatMap(name => ['url', 'sourceUrl'].map(field => g => [g[name][0], field])),
  g => [g.events[0], 'registrationUrl'],
];
for (const url of [
  'not-a-url', 'http://catalog.validation-only.org/course', 'https://user:password@catalog.validation-only.org/course',
  'https://example.invalid/course', 'https://example.com/course', 'https://catalog.test/course',
  'https://localhost/course', 'https://discord.gg/invite-code',
  'https://127.0.0.1/course', 'https://[::1]/course', 'https://10.0.0.1/course',
  'https://172.16.0.1/course', 'https://192.168.1.1/course', 'https://169.254.1.1/course',
  'https://100.64.0.1/course', 'https://0.0.0.0/course', 'https://[fc00::1]/course',
  'https://[fe80::1]/course', 'https://[::ffff:127.0.0.1]/course',
  'https://192.0.0.8/course', 'https://192.0.2.1/course', 'https://192.88.99.2/course',
  'https://198.18.0.1/course', 'https://198.19.255.254/course', 'https://198.51.100.1/course', 'https://203.0.113.1/course',
  'https://[2001:db8::1]/course', 'https://[2001:2::1]/course', 'https://[100::1]/course',
  'https://[100:0:0:1::1]/course', 'https://[64:ff9b:1::1]/course', 'https://[3fff::1]/course',
  'https://[5f00::1]/course', 'https://[fec0::1]/course', 'https://[::ffff:192.0.2.1]/course',
  'https://[::ffff:8.8.8.8]/course', 'https://[::ffff:192.0.0.9]/course',
  `https://discord.com/%63hannels/${OTHER_GUILD}/${CHANNEL}`,
  `https://discord.com/%65vents/${OTHER_GUILD}/444444444444444444`,
  `https://discord.com/channels%2F${OTHER_GUILD}%2F${CHANNEL}`,
  `https://discord.com/%2563hannels/${OTHER_GUILD}/${CHANNEL}`,
  `https://discord.com/channels/${GUILD}/%33`,
  `https://discord.com/%69nvite/code`, 'https://discord.com/%2finvite/code',
  `https://canary.discord.com/%65vents/${GUILD}/not-an-event`,
  'https://discordapp.com/%zz',
  ...['discord.com', 'www.discord.com', 'canary.discord.com', 'ptb.discord.com', 'discordapp.com', 'www.discordapp.com', 'discord.com.'].map(host =>
    `https://${host}/api/webhooks/${CHANNEL}/synthetic-not-a-credential`),
  `https://discord.com/api/v10/webhooks/${CHANNEL}/synthetic-not-a-credential`,
  'https://service.local/course', 'https://service.internal/course', 'https://service/course',
  'https://foo..bar/course', 'https://.example.dev/course', 'https://-host.validation-only.org/course',
  'https://host-.validation-only.org/course', 'https://host_name.validation-only.org/course',
  `https://${'a'.repeat(64)}.validation-only.org/course`, `https://${Array(128).fill('ab').join('.')}/course`,
  `https://discord.com/events/${OTHER_GUILD}/444444444444444444`,
  `https://discord.com/events/${GUILD}/not-an-event`,
  `https://discord.com/events/${GUILD}/444444444444444444/extra`,
  `https://discord.com/events/${GUILD}`,
  `https://discord.com/channels/${OTHER_GUILD}/${CHANNEL}`,
  `https://discord.com/channels/${GUILD}/not-a-channel`,
  'https://discord.com/channels/@me/333333333333333333',
]) {
  test(`reject invalid or wrong-guild URL ${url} in every URL field`, () => {
    for (const locate of urlLocations) {
      const directory = activeDirectory();
      const [entry, field] = locate(directory.guilds[0]);
      entry[field] = url;
      assert.throws(() => validateCommunityDirectory(directory));
    }
  });
}

test('same-guild Discord channel and message URLs are valid', () => {
  const directory = activeDirectory();
  const guild = directory.guilds[0];
  guild.entrypoints.help.url = `https://discord.com/channels/${GUILD}/${CHANNEL}`;
  guild.discussions[0].url = `https://discord.com/channels/${GUILD}/${CHANNEL}/444444444444444444`;
  guild.events[0].url = `https://discord.com/events/${GUILD}/444444444444444444`;
  guild.events[0].registrationUrl = `https://discord.com/events/${GUILD}/444444444444444444`;
  assert.doesNotThrow(() => validateCommunityDirectory(directory));
});

test('public IP literals remain valid without a DNS lookup', () => {
  for (const host of ['8.8.8.8', '[2606:4700:4700::1111]', '192.0.0.9', '192.0.0.10', '[2001:3::1]', '[2001:4:112::1]']) {
    const directory = activeDirectory();
    directory.guilds[0].entrypoints.help.url = `https://${host}/help`;
    assert.doesNotThrow(() => validateCommunityDirectory(directory));
  }
});
test('valid DNS labels, IDN punycode and a single trailing root dot remain valid',()=>{
  for(const host of ['a.validation-only.org','course-1.validation-only.org','bücher.validation-only.org','xn--bcher-kva.validation-only.org','catalog.validation-only.org.']) {
    const directory=activeDirectory();directory.guilds[0].entrypoints.help.url=`https://${host}/help`;
    assert.doesNotThrow(()=>validateCommunityDirectory(directory));
  }
});

test('UTC and daylight-saving event offsets validate at their actual dates', () => {
  const directory = activeDirectory();
  const event = directory.guilds[0].events[0];
  Object.assign(event, { startsAt: '2030-01-18T14:00:00-08:00', endsAt: '2030-01-18T16:00:00-08:00' });
  assert.doesNotThrow(() => validateCommunityDirectory(directory));
  Object.assign(event, { startsAt: '2032-02-29T14:00:00Z', endsAt: '2032-02-29T16:00:00+00:00', timezone: 'UTC' });
  assert.doesNotThrow(() => validateCommunityDirectory(directory));
});
