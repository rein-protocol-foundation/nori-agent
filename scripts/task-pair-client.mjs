import { createTrackingClient } from './task-tracking-client.mjs';

const GITHUB_API = 'https://api.github.com';
const LINEAR_API = 'https://api.linear.app/graphql';
const QUERY_FIELDS = 'id title team { id key } project { id } attachments(first:100) { nodes { url } pageInfo { hasNextPage } }';
const code = reason => Error(`task_pair_${reason}`);

export function createPairClient(config, { fetchImpl = fetch, env = process.env, checkAuthority = () => {} } = {}) {
  const scope = config.issuePairing;
  const repo = config.github.repository;
  const issues = `/repos/${repo}/issues`;
  const tracking = createTrackingClient(config, { fetchImpl, env, checkAuthority });
  async function request(provider, url, { method = 'GET', body } = {}) {
    checkAuthority();
    const secret = env[config[provider].tokenEnv];
    if (!secret?.trim()) throw code('credential_missing');
    let response;
    try {
      response = await fetchImpl(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs),
        headers: {
          Authorization: provider === 'linear' && config.linear.auth === 'api-key' ? secret : `Bearer ${secret}`,
          'Content-Type': 'application/json',
          ...(provider === 'github' ? {
            Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10',
          } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw code('transport_unavailable');
    }
    if (!response.ok) throw code('response_unavailable');
    try {
      return await response.json();
    } catch {
      throw code('invalid_response');
    }
  }
  const github = (path, options) => request('github', GITHUB_API + path, options);
  async function linear(query, variables) {
    const result = await request('linear', LINEAR_API, { method: 'POST', body: { query, variables } });
    if (result.errors?.length || !result.data) throw code('linear_lookup_unavailable');
    return result.data;
  }
  async function authorize(writing = false) {
    await tracking.authorize();
    const [repository, data] = await Promise.all([
      github(`/repos/${repo}`),
      linear('query PairTeam($id:String!) { team(id:$id) { id key } }', { id: config.linear.teamId }),
    ]);
    if (repository.full_name !== repo || String(repository.id) !== scope.githubRepositoryId ||
      data.team?.id !== config.linear.teamId || data.team?.key !== scope.linearTeamKey)
      throw code('scope_mismatch');
    if (writing && (repository.private !== false || repository.has_issues !== true || repository.archived === true))
      throw code('public_issue_creation_unavailable');
    if (writing && config.actor.mode === 'delegated' && !config.actor.writeSources.includes('github'))
      throw code('delegation_denied');
    checkAuthority();
  }
  function sourceIssue(value, expectedNumber) {
    if (!value || value.pull_request || value.repository_url !== GITHUB_API + `/repos/${repo}` ||
      !Number.isSafeInteger(value.number) || value.number < 1 || (expectedNumber && value.number !== expectedNumber) ||
      !['open', 'closed'].includes(value.state) || typeof value.title !== 'string') throw code('source_mismatch');
    return value;
  }
  function matchesApproved(value, proposal) {
    return value.title === proposal.title && (value.body ?? '') === proposal.body &&
      String(value.user?.id) === config.github.actorId;
  }
  const getGithub = async number => sourceIssue(await github(`${issues}/${number}`), number);
  async function getLinear(id) {
    const { issue } = await linear(`query PairLinearIssue($id:String!) { issue(id:$id) { ${QUERY_FIELDS} } }`, { id });
    if (issue?.id !== id) throw code('linear_issue_unavailable');
    return issue;
  }
  async function byTitle(title) {
    const { issues: connection } = await linear(`query PairByTitle($team:String!,$title:String!) {
      issues(first:25, filter:{team:{key:{eq:$team}},title:{eq:$title}}) {
        nodes { ${QUERY_FIELDS} } pageInfo { hasNextPage }
      }
    }`, { team: scope.linearTeamKey, title });
    if (!Array.isArray(connection?.nodes) || connection.pageInfo?.hasNextPage !== false)
      throw code('lookup_incomplete');
    return connection.nodes.filter(issue => issue.title === title);
  }
  function attachments(issue) {
    if (issue?.team?.id !== config.linear.teamId || issue?.team?.key !== scope.linearTeamKey ||
      (scope.linearProjectId && issue.project?.id !== scope.linearProjectId))
      throw code('linear_issue_outside_scope');
    if (!Array.isArray(issue.attachments?.nodes) || issue.attachments.pageInfo?.hasNextPage !== false)
      throw code('lookup_incomplete');
    const prefix = `https://github.com/${repo}/issues/`;
    return [...new Set(issue.attachments.nodes.flatMap(({ url }) => {
      if (typeof url !== 'string' || !url.startsWith(prefix)) return [];
      const suffix = url.slice(prefix.length);
      const number = Number(suffix);
      return /^[1-9]\d*$/.test(suffix) && Number.isSafeInteger(number) ? [number] : [];
    }))];
  }
  async function recentByReference(proposal, since) {
    const matches = [];
    for (let page = 1; page <= 3; page++) {
      const query = new URLSearchParams({ state: 'all', sort: 'created', direction: 'desc', since, per_page: '100', page: String(page) });
      const result = await github(`${issues}?${query}`);
      if (!Array.isArray(result)) throw code('invalid_response');
      for (const value of result) {
        if (value.pull_request || !value.title?.includes(proposal.marker)) continue;
        matches.push(sourceIssue(value));
      }
      if (result.length < 100) return matches;
    }
    throw code('lookup_incomplete');
  }
  async function create(proposal) {
    const issue = sourceIssue(await github(issues, { method: 'POST', body: { title: proposal.title, body: proposal.body } }));
    if (!matchesApproved(issue, proposal)) throw code('created_issue_unconfirmed');
    return issue.number;
  }
  return { authorize, getGithub, getLinear, byTitle, attachments, recentByReference, matchesApproved,
    create, verifyPair: task => tracking.read(task) };
}
