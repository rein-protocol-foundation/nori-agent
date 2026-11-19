# Slack schedule ownership during the development-channel cutover

SA-OPS-01 / SA-M1. Owner: Codex. Original ownership diagnosis and subsequent November 19, 2026 scheduler verification.

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

## Initial proposal before the native script probe

An upstream extension can retain the creator's native session ownership and explicitly delegate **execution** to an administrator-configured sandbox profile. At submission the host must validate the incoming human session, channel and workspace, persist the exact Slack thread, and intersect the creator's granted tools with the executor's sandbox policy. Verify the immutable policy again at execution, after restart and on update. The child may never supply an owner, target identity, or host execution entitlement. New work in ordinary Slack channels needs the channel scheduling policy independently of ACP authorization.

Existing jobs need a separate owner-continuity decision. A binding transition can authorize management of specific existing job IDs only from the corresponding verified original Slack audience/thread and account, while preserving the original owner and audit history. Another option is host-supported routing of scheduling requests back into the actual original owner session. In either implementation, concurrent updates must use native revisions, and previously created jobs must retain their next run, delivery target, and sandbox.

A direct store write, an unscoped operator RPC, or a global manage-all grant would skip these native ownership checks. The production configuration patch previously approved for ACP alone does not provide this host contract. The versioned upstream source is read-only in this repository.

## Release criteria

Before switching the channel, prove that a current user can create and update a sandbox job, that a real scheduled execution runs in the intended sandbox, and that its result returns to the originating thread. Verify an original job remains addressable by its authorized audience. Try another thread/account, a revoked member and a senderless tool call as negative cases. Verify normal internal public and private Slack scheduling while ACP remains restricted to its intended channels. Independently verify a real coding task, review, indefinite summary and same-thread readback, plus continued access from the original test channel. The ACP tests and prior Slack tests do not establish these new results.

The draft also separates the Slack scheduler membership check from ACP/development membership. The scheduling-only public-channel option requires current membership of a listed internal public workspace channel and an eligible sandboxed scheduling agent. Private development/ACP eligibility still uses the existing private-channel check. The scheduler list now supports more than 16 entries, while the development list retains its original limit. This is a prerequisite only; enabling it on the current unsandboxed main profile is deliberately rejected. Twenty-seven focused routing/creation checks passed with no skips.

## Verified native scheduled execution

The cutover uses an isolated native script job owned by the current main Slack thread.
The program passes the requested task as a serialized string to sessions_spawn on the
configured development agent with sandbox required and isolated context. It waits for
the accepted run ID and returns the terminal result via the scheduler's native thread
announcement. Timers, execution history, the job ID and edits remain in OpenClaw.
Other workspace channels can create reminders or request currently available public
web tools. Membership verification resolves the actual workspace, account and channel.
The existing native creator permission still applies. ACP uses the private channel list.

An isolated Gateway on OCI, using simulated Slack/inference and the actual SSH sandbox,
created one job as main, adjusted its time using the same ID and waited for the clock.
The child ran the arithmetic 113 + 271 as nori-dev in its session workspace and returned
384 to the simulated originating thread. An earlier fixture run used a tool wrapper
which the child did not expose and produced no execution evidence. The corrected run
loaded both production plugins and used the child's advertised exec tool.
The administrator selected main for all formal-channel threads, including the old
acceptance thread. No historical owner or conversation binding is migrated.

The production timer ran at its revised time, 11:16:57 UTC on November 19, 2026. Its native receipt recorded success and delivery, and the Slack thread received nori-dev, its SSH workspace path and 4187. The first creation selected the sandbox agent as the native job owner. The follow-up normalizes only the configured executor on its eligible channel to the real thread owner. The first coding attempt used the ordinary development worker, and a later ACP attempt stopped before launch. Updated tool feedback identifies the requested harness and a short, scoped reference resolves to the stored assignment at native admission. Both still require live Codex acceptance.

The post-release formal-channel Codex run on November 19 produced the slot-minutes tool and four passing tests. An independent read-only, network-isolated rerun verified the two files. The native ACP lifecycle receipt and Slack completion were both present, but the native announcement exposed no review tools. Recording a newly verified receipt for an active attempt now requests one native background-task wake on the original parent thread. The parent must still check the criteria and explicitly review the result before the server can retain a completed summary.
