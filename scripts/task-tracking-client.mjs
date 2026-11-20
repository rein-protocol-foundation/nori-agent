// Narrow, status-only adapter. Linear's native GitHub integration owns mirroring.
export function createTrackingClient(config, { fetchImpl = fetch, env = process.env, checkAuthority = () => {} } = {}) {
  const credential = provider => {
    const value = env[config[provider].tokenEnv];
    if (!value?.trim()) throw Error(`tracking_${provider}_credential_missing`);
    return value;
  };
  async function request(provider, path, body, method) {
    checkAuthority();
    const token = credential(provider);
    const url = provider === 'linear' ? 'https://api.linear.app/graphql' : `https://api.github.com${path}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: method ?? (body ? 'POST' : 'GET'), redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs),
        headers: { 'Content-Type': 'application/json',
          Authorization: provider === 'linear' && config.linear.auth === 'api-key' ? token : `Bearer ${token}`,
          ...(provider === 'github' ? { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw Error(`tracking_${provider}_transport_unavailable`); }
    if (!response.ok) throw Error(`tracking_${provider}_http_${response.status}`);
    let data;
    try { data = await response.json(); } catch { throw Error(`tracking_${provider}_invalid_json`); }
    checkAuthority();
    if (provider === 'linear') {
      if (data.errors?.length || !data.data) throw Error('tracking_linear_graphql_error');
      return data.data;
    }
    return data;
  }
  const graphql = (query, variables = {}) => request('linear', '', { query, variables });
  const issuePath = task => `/repos/${config.github.repository}/issues/${task.githubIssue}`;
  async function authorize() {
    if (config.actor.mode === 'delegated' && Date.parse(config.actor.expiresAt) <= Date.now())
      throw Error('tracking_delegation_expired');
    const [github, linear] = await Promise.all([
      request('github', '/user'), graphql('query TrackingActor { viewer { id } }'),
    ]);
    if (String(github.id) !== config.github.actorId || linear.viewer?.id !== config.linear.actorId)
      throw Error('tracking_actor_mismatch');
  }
  async function read(task) {
    const [github, linear] = await Promise.all([
      request('github', issuePath(task)),
      graphql('query TrackingIssue($id: String!) { issue(id: $id) { id updatedAt team { id } state { id type } attachments(first:100) { nodes { url } } } }', { id: task.linearIssue }),
    ]);
    const issue = linear.issue;
    if (github.pull_request || github.number !== task.githubIssue || !['open', 'closed'].includes(github.state) ||
        github.repository_url !== `https://api.github.com/repos/${config.github.repository}` ||
        !issue?.attachments?.nodes?.some(attachment =>
          attachment.url === `https://github.com/${config.github.repository}/issues/${task.githubIssue}`) ||
        !issue?.id || issue.id !== task.linearIssue || issue.team?.id !== config.linear.teamId || !issue.state?.id ||
        !github.updated_at || !issue.updatedAt) throw Error('tracking_pair_mismatch');
    return {
      github: { state: github.state, reason: github.state === 'closed' ? github.state_reason : null, revision: github.updated_at },
      linear: { state: issue.state.id, revision: issue.updatedAt },
    };
  }
  async function write(task, source, target) {
    // Verify the actual account again immediately before an external mutation.
    if (config.actor.mode === 'delegated' && !config.actor.writeSources?.includes(source))
      throw Error('tracking_delegation_source_denied');
    await authorize();
    checkAuthority();
    if (config.actor.mode === 'delegated' && Date.parse(config.actor.expiresAt) <= Date.now())
      throw Error('tracking_delegation_expired');
    if (source === 'github') {
      await request('github', issuePath(task), { state: target.github.state,
        state_reason: target.github.state === 'open' ? 'reopened' : target.github.reason }, 'PATCH');
    } else {
      const result = await graphql('mutation TrackingStatus($id: String!, $state: String!) { issueUpdate(id: $id, input: { stateId: $state }) { success } }',
        { id: task.linearIssue, state: target.linear.state });
      if (result.issueUpdate?.success !== true) throw Error('tracking_linear_update_unconfirmed');
    }
  }
  return { authorize, read, write };
}
