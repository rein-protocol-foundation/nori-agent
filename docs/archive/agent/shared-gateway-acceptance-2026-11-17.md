# Shared Gateway production acceptance — 2026-11-17

SA-M0 / #57; owner: Codex. **Deployed and verified in real Slack and Discord**, including a full
shared Gateway restart. This supersedes the earlier hold and prepared-only Dashboard records.
The owner authorized migration, deployment/restarts and channel tests; two other deployment chats
released the window. No vendor edits were made.

## Release and topology

[PR #103](https://github.com/rein-protocol-foundation/nori-agent/pull/103) merged as
`496b9d30eaa1567e1259bd102be5957982a7997a`. Its final head passed all seven checks in
[CI run 44185916125](https://github.com/rein-protocol-foundation/nori-agent/actions/runs/44185916125).
Community now uses a Discord-only query/identity backend; internal governance registration and strict
validation remain. The review fix assigns Slack reply guards to the first internal profile even when
Community appears first. 57 focused regressions and scaffold checks passed.

`nori-slack` now serves both channels on port 18791 from the existing `runtime/openclaw` state.
The unit name and native `/slack` path remain for compatibility. `nori-discord` is disabled/inactive
and port 18793 is closed. Router and web services remain active. The updater now manages the three
live services and probes both `main` and `nori-community` on the shared Gateway. Automatic updates
were resumed after acceptance; no unfinished deployment transaction or queued event remained.

The authenticated [Admin workbench](https://nori-admin.rein-protocol.org/apps) visibly has one
“打开 Nori” entry. Native Agents shows the four retained roles plus Community; main is named
“Nori · 主助手”. Browser authentication survived restart and the native connection remained healthy.
The old `/discord/` native deep links are not redirected; use the single workbench entry.

## Data and existing capability preservation

Before cutover, services stopped under the updater lock and all runtime/workspace files were backed
up to root-only `/var/backups/nori-shared-gateway-20261117`. Configuration, launcher, updater settings
and per-row preservation manifests were retained there. No private artifacts or credentials enter Git.

After migration and restart, hashes of every original row in all four retained agent databases were
still present: 82 session nodes, 114 windows, 7,278 transcript events and one archived generation.
New acceptance messages were appended normally. Main tools, model defaults, sandbox/workspace/skills,
Slack channel settings, business backend and plugin load paths were preserved, including the private
ACP artifact. All 12 original native Cron definitions and enabled states remained; OpenClaw added its
standard Community skill-review monitor. Community request admission continues to reject non-Discord
origins. All 15 existing SEO files and private directory mode 0700 were unchanged; both SEO schedules
and their successful run state remained intact.

Community starts fresh under `nori-community`; old Discord history was not imported. All 4,990 files
in the old `runtime/discord-catalog-prod` profile were retained byte-for-byte. The user permitted
history disposal, but no old profile deletion was needed. The immutable public seed remains outside
the service-writable home. Community credentials are separate, and approved limits remain 6/user/min,
30/conversation/min, concurrent 2/user, 4/conversation, 8/Community, and 2,000 model requests/day including
retries. Observed Community assistant model records contain only DeepSeek v4.1 Flash; no Qwen-first
or paid fallback was introduced.

## Actual channel evidence

These checks inspected native tool calls/results as well as visible bot replies; prose claims alone
were not accepted. Test content was synthetic and private values are omitted here.

- **Slack S1/S2:** real messages ran `exec` (43 × 47 = 2021), read the public SEO skill, and retrieved
  the pre-existing retained summary with evidence value 1147 and no expiry. After a full shared
  service restart, exec and the same retained-summary read passed again.
  [Post-restart reply](https://reinprotocolf-e2q1425.slack.com/archives/C0C4L0YN814/p1794954362235689?thread_ts=1794863584.039689&cid=C0C4L0YN814).
- **Discord D1:** public `rein_resources_search` returned the official Hugging Face AI Agents Course.
  [Resource reply](https://discord.com/channels/1558049042494128219/1558050207734698056/1572375409784397935).
- **Discord M1–M3:** saved a synthetic private bookmark, issued native `/reset` (acknowledged), and
  recovered the original message with `sessions_search`. After index initialization and a full
  Gateway restart, `memory_search` directly returned the original private message without warnings.
  Keyword search uses native FTS, provider `none`; this does not claim semantic embeddings.
- **Discord P1:** public-channel `memory_search` and `sessions_search` returned only public-scope
  candidates and no private bookmark/original DM marker.
  [Public isolation reply](https://discord.com/channels/1558049042494128219/1558050207734698056/1572377450107642058).
  An independent raw-event scan found the synthetic value only in its DM, never in the public
  session, main transcript events or the public seed files.
- **Restart/security:** shared PID changed; both authenticated agent health probes returned 200,
  router sync was healthy and unauthenticated invocation was rejected. Main business-write tools
  stayed enabled; Community business-write tools stayed disabled.

The initial Slack relative skill path failed, then the corrected absolute path succeeded. The first
fresh Community keyword lookup reported an automatic-index-repair warning while native session search
already recovered the original. A targeted native `memory status --index --agent nori-community`
completed the derived index (two files/three chunks, valid identity, clean); post-restart keyword
retrieval and public rejection then passed without warnings. No history or main index was reset.

Earlier local full-suite execution had one process-tree timing failure under load; its focused rerun
passed 9/9. An initial incompatible local Node/native-dependency run is not release evidence. Final
CI passed all seven required checks. Only one real Discord human identity was used: cross-user
rejection is native synthetic evidence, not two-human live acceptance. Attachments/thread replies
were out of requested scope; production quota saturation and exhaustive main-tool execution were
not performed. Configuration preservation, focused compatibility tests and the above actual tools
support the stated acceptance without claiming the entire product roadmap is complete.

## Recovery

Keep the backup, old Discord profile and new Community state. If rollback is necessary, coordinate a
window, pause the updater, take its lock and restore only the previous topology/configuration/launchers
and updater settings; restore the split Dashboard list and standalone Discord service as needed.
Do not overwrite live Slack databases with the old snapshot or discard newly accepted messages.
The old Discord profile cannot automatically absorb new Community conversations; preserve both for
explicit reconciliation. No lossless import support or vendor patch is implied by this fresh-state cutover.
