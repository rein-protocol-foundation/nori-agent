# Trusted Slack host access

[中文说明](trusted-slack-host-access-zh.md)

Operator-requested development/RSI capability change; no change to PRD governance authority.

The operator-authorized Slack profile uses host tools for normal development and RSI.
For both `main` and `director-control`, configure:

```json
{
  "sandbox": { "mode": "off" },
  "tools": {
    "profile": "full",
    "exec": {
      "host": "gateway",
      "mode": "full",
      "applyPatch": { "enabled": true, "workspaceOnly": false }
    },
    "fs": { "workspaceOnly": false }
  }
}
```

Remove the old controller-only AGENTS instructions and the empty skills allowlist.
Disable the old `rein-acp` authorization/coordinator plugin, whose runtime invariant
requires the restricted controller tool surface. Keep `acpx` and the existing ACP
backend configured for optional delegation. Keep Slack account/channel admission
controls. Do not apply this configuration to the Discord profile.

Install `plugins/rein-host-guard` in a private preserved runtime directory, add it to
`plugins.load.paths` and `plugins.allow`, and enable its entry. Its config requires
`defaultCwd` and absolute `protectedPaths` (system directories, deployed OpenClaw,
core plugins and the guard itself). Enable entry hooks `allowConversationAccess`
and `allowPromptInjection` for the Slack-only operating guidance. The plugin registers
a before-tool-call accident guard and a Slack-only system-context policy.

This guard detects common literal destructive commands and patch deletions, including
ancestor targets. It permits edits and ordinary project work. It is intentionally NOT
a shell parser or a security boundary: variable expansion, arbitrary scripts, delegated
ACP processes, sudo and altered code can bypass it. Core edits can also damage the runtime
without deletion. The operating policy forbids bypasses and requires backups and validation.
Unrestricted sudo plus writable core cannot provide a hard non-deletion guarantee.
Package manager installation is allowed with the service user's existing sudo authority.

The 2026-11-06 host change preserved a private rollback copy of the Slack configuration
and controller AGENTS file under `runtime/host-permission-backups/`. The guard is deployed
under `runtime/host-guard/`, preserved across normal application updates. No private
configuration or conversation data belongs in Git. Local regression verification:
`node --test tests/host-guard.test.mjs`.

Discord continues to use its existing tool allowlist and backend community identity checks.
The current production Discord profile uses a fixed Qwen model and does not enable rein-router.
Do not treat model routing or AGENTS prose alone as filesystem isolation.


## Current channel boundaries

Slack and Discord use separate gateway processes and private configurations (ports 18791
and 18793). Each disables the other channel. The Slack development channel binds to
director-control; other admitted Slack traffic binds to main. The older sandboxed
nori-development agent is unchanged.

Slack DMs remain disabled; channels use allowlist admission and require mentions. Some
channels have sender lists, others do not; the development channel includes a wildcard.
Thus admitted Slack traffic is trusted, not exclusively backend-verified Directors.
Disabling rein-acp also removes its per-call Director authorization. Governance tools
retain their separate backend checks.

Discord DMs and native commands remain disabled. One guild and two channels are allowed;
one channel requires mentions, the other does not. Its tool allowlist includes web search,
web fetch, messaging, four resource/event read tools, three identity-binding tools,
rein_status and rein_member_status. Shell, filesystem, session delegation and governance
tools are excluded. Catalog calls verify Community Member linkage every time.
Both gateways share the host and workspace path; this is not OS-level isolation.

## Rollout, evidence and rollback

The operator-authorized production change was installed on 2026-11-06 (America/Los_Angeles)
BEFORE this PR. This PR records that existing deployment, not a future first rollout.
Only Slack was restarted; both gateway health probes subsequently passed.
The active application checkout and OpenClaw upstream source remained unchanged.

A non-delivering embedded director-control agent turn executed printf NORI_HOST_OK,
sudo -n true, wrote a temporary marker and read it back. Passwordless sudo already existed;
no sudoers grants were added. No software was installed for testing and no Slack message
was sent. Real Slack end-to-end acceptance remains pending.

The custom guard is first-party repository code, not a community plugin. Production protects
the listed system directories, deployed vendor/openclaw, the ENTIRE plugins directory and
the guard directory. This is not a complete system-file inventory. Complex commands may
also be falsely blocked. The 14 focused tests cover common literal cases, not arbitrary-code
resistance or delegated ACP processes.

The runtime/host-guard copy is preserved across application updates. Merging source does
NOT refresh this copy. Back it up, copy reviewed plugin files, validate config, restart
Slack and recheck health when updating it. Do not copy runtime probe logs into source.

Rollback: acquire the deployment lock, ensure no update transaction is active, restore the
matching private Slack config AND controller AGENTS backup, validate, and restart Slack.
The old rein-acp plugin and restricted controller surface must be restored together.
Keep the unreferenced guard files; Discord needs no rollback. See the auto-update guide.

Loader verification: npm run toolchain:pnpm -- exec node scripts/verify-host-guard.mjs (isolated temporary configuration; no live accounts).
