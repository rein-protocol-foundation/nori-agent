# Internal Lark development

The shared gateway can opt one existing internal Lark chat into repository development. It keeps
its Main agent binding and sender/topic sessions. An approved sender must explicitly @mention
Nori in every group message, including replies in a topic. Main can delegate one-shot work to
the existing `nori-development` sandbox and report the outcome in the originating conversation.
The Router can consider eligible development models for complex coding when Jev is enabled.
Community and other internal groups retain their existing admission and effective tool policies.

## Prepare a candidate

Use the installed dual-account Lark profile with its existing approved group and sender
allowlists. The native Main route must use `rein-magpie/auto` with no native fallbacks and allow
the `nori-development` subagent. The worker needs an existing per-session sandbox, sandbox
execution, and disabled elevated execution. Install the requested shared workspace skill,
such as `rein-people`, where OpenClaw discovers it for this worker. The worker also needs the
repository checkout or approved access to it and any separately authorized GitHub credentials.
Check that the worker can access the project before activating the candidate. Verify native skill
discovery from the installed private runtime. For the People skill, run
`openclaw skills info rein-people --agent nori-development`.

Generate a separate file from the current private gateway JSON. Use the native Lark chat ID from
the internal account's allowlist. This command creates a new file with mode `0600` and refuses to
overwrite an existing file.

```sh
node scripts/configure-lark-routing.mjs "$LARK_DEVELOPMENT_CHAT_ID" \
  "$CURRENT_OPENCLAW_CONFIG" "$PRIVATE_CANDIDATE_CONFIG"
```

Review the candidate and validate it with the pinned OpenClaw CLI using the usual private
runtime environment. Install it only during an authorized rollout. Keep the previous private
config for rollback. Restore it as a unit to remove the exact group tool policies and the Router
opt-in together. If a Lark group is added later, update the account allowlist and preserve its
exact group tool cap in the same config change. Router Console refresh preserves the host opt-in.

Successful deployment still needs real-user acceptance. From the approved group, @mention Nori
with an authorized repository request and check that the sandbox worker is actually accepted,
runs the requested checks, and returns the result. An unmentioned thread reply must be silent.
