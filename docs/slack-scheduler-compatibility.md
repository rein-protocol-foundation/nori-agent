# Slack schedule ownership during the development-channel cutover

SA-OPS-01 / SA-M1. Owner: Codex. Production cutover blocked at the native scheduler ownership boundary on November 19, 2026.

Production uses a Slack allowlist with 17 channel entries. The scheduler creation policy currently trusts one private development channel bound to nori-development. The scheduler inventory contains two jobs owned or executed by that agent, including one enabled job. These counts are read-only observations and do not identify individual users or include job contents.

At OpenClaw 4a11f89e840b2bb3eedcad2820ab25b8520905b6 the Gateway derives the creator from the signed agent-tool session. Its cron.add check calls cronCreateMatchesCallerScope. Its job access checks use cronJobMatchesCallerScope. The native probe exercises these actual predicates with a single Slack thread and account under both bindings:

| Caller | Operation | Native decision |
|---|---|---|
| Development agent | Create job with itself as executor | Allow |
| Main | Create job with itself as executor | Allow |
| Main | Create job with the development agent as executor | Refuse |
| Original development owner | Access its existing job | Allow |
| Main after channel rebind | Access that same existing job | Refuse |

Run scripts/verify-cron-caller-scope.mjs with Node 24, REIN_TEST_OPENCLAW set to the built pinned checkout, TSX_TSCONFIG_PATH set to that checkout's tsconfig.json, and --import pointing to its node_modules/tsx/dist/loader.mjs. The probe never registers a job.

## Required host contract

An upstream extension can retain the creator's native session ownership and explicitly delegate **execution** to an administrator-configured sandbox profile. At submission the host must validate the incoming human session, channel and workspace, persist the exact Slack thread, and intersect the creator's granted tools with the executor's sandbox policy. Verify the immutable policy again at execution, after restart and on update. The child may never supply an owner, target identity, or host execution entitlement. New work in ordinary Slack channels needs the channel scheduling policy independently of ACP authorization.

Existing jobs need a separate owner-continuity decision. A binding transition can authorize management of specific existing job IDs only from the corresponding verified original Slack audience/thread and account, while preserving the original owner and audit history. Another option is host-supported routing of scheduling requests back into the actual original owner session. In either implementation, concurrent updates must use native revisions, and previously created jobs must retain their next run, delivery target, and sandbox.

A direct store write, an unscoped operator RPC, or a global manage-all grant would skip these native ownership checks. The production configuration patch previously approved for ACP alone does not provide this host contract. The versioned upstream source is read-only in this repository.

## Release criteria

Before switching the channel, prove that a current user can create and update a sandbox job, that a real scheduled execution runs in the intended sandbox, and that its result returns to the originating thread. Verify an original job remains addressable by its authorized audience. Try another thread/account, a revoked member and a senderless tool call as negative cases. Verify normal internal public and private Slack scheduling while ACP remains restricted to its intended channels. Independently verify a real coding task, review, indefinite summary and same-thread readback, plus continued access from the original test channel. The ACP tests and prior Slack tests do not establish these new results.
