import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Explicit fast paths; unfamiliar executable paths fall back to all native probes.
export function classifyChanges(paths, { full = false } = {}) {
  const scope = { plugins: full, routing: full, isolation: full };
  for (const path of paths) {
    if (/^(docs\/|assets\/|.*\.md$)/.test(path) || ['LICENSE', '.gitignore'].includes(path)) continue;
    scope.plugins = true;
    if (/^plugins\/rein-operations\//.test(path)) continue;
    if (/^(workspace\/|templates\/|evals\/)/.test(path)) continue;
    if (/^plugins\/rein-router\//.test(path)) { scope.routing = true; continue; }
    if (/^plugins\/rein-(discord|slack|isolation)\//.test(path)) {
      // Routing also consumes these adapters' native ingress/context contracts.
      scope.routing = scope.isolation = true;
      continue;
    }
    if (/^tests\/.*\.test\.mjs$/.test(path) && !/-native\.test\.mjs$/.test(path)) continue;
    if (/^scripts\/(check|validate-community-directory|verify-plugin|verify-proposal-tools)\.mjs$/.test(path)) continue;
    if (/^(scripts\/(agent-browser[^/]*|verify-agent-browser)\.mjs|config\/agent-browser[^/]*|bin\/agent-browser)$/.test(path)) continue;
    if (path === '.github/workflows/browser.yml') continue;
    scope.routing = scope.isolation = true;
  }
  return scope;
}

export function changedPaths(base, head = 'HEAD', { pullRequest = false, cwd } = {}) {
  if (!/^[a-f0-9]{40,64}$/i.test(base) || /^0+$/.test(base)) throw new Error('Missing base commit');
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const from = pullRequest ? git(['merge-base', base, head]).trim() : base;
  // Disable rename detection so both the deleted and added paths select coverage.
  return git(['diff', '--name-only', '--no-renames', '-z', from, head, '--']).split('\0').filter(Boolean);
}

export function requiredChecksPass(scope, results) {
  if (results.changes !== 'success') return false;
  return ['plugins', 'routing', 'isolation'].every(name =>
    scope[name] ? results[name] === 'success' : results[name] === 'skipped');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let scope;
  try {
    if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
      scope = classifyChanges([], { full: true });
    } else {
      const pr = process.env.GITHUB_EVENT_NAME === 'pull_request';
      scope = classifyChanges(changedPaths(pr ? event.pull_request.base.sha : event.before, 'HEAD', { pullRequest: pr }));
    }
  } catch (error) {
    console.warn(`Change detection unavailable; running all checks: ${error.message}`);
    scope = classifyChanges([], { full: true });
  }
  for (const [name, selected] of Object.entries(scope)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${selected}\n`);
  }
  console.log(scope);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Selected CI coverage\n\n${Object.entries(scope).map(([name, selected]) => `- ${name}: ${selected ? 'run' : 'not affected'}`).join('\n')}\n`);
  }
}
