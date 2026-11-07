# Cron failure alerts and independent watchdog

Production activation: 2026-11-06 (America/Los_Angeles).

Supports PRD US14 (exception handling) and US15 (recovery). This document records
observed acceptance at the times below, not a claim that production configuration
has remained unchanged since then.

## Native scheduler alerts

The Slack gateway's private `runtime/openclaw/openclaw.json` now contains:

```json
{
  "cron": {
    "failureAlert": {
      "enabled": true,
      "after": 1,
      "cooldownMs": 3600000,
      "mode": "announce",
      "channel": "slack",
      "to": "C0CG9BQQ4Q0",
      "accountId": "default"
    }
  }
}
```

The change was validated and hot-loaded without a gateway restart. Global policy
applies to jobs that inherit it; explicit per-job overrides (including
`failureAlert: false` and best-effort delivery behavior) still take precedence.
Native recovery notifications follow successful runs after a reported failure.
Normal job output remains undelivered for maintenance jobs with `delivery.mode: none`.

## Independent monitor

The operator selected a host-based monitor after Axiom's New monitor action was
disabled on the Personal plan. Existing Axiom rules were not modified.

- Implementation: `deploy/nori-cron-monitor.py`.
- Installed executable: `/opt/nori-updater/nori-cron-monitor.py`.
- Systemd: `nori-cron-monitor.timer` invokes `nori-cron-monitor.service` every
  60 seconds after the preceding invocation completes (up to 5 seconds jitter).
- Private configuration: `/etc/nori-cron-monitor.json` (root, mode 0600).
- Durable cursor, incidents, and outbox: `/var/lib/nori-cron-monitor/state.json`.
- Credentials: existing `/etc/nori-report.credentials.json` `slackBotToken`;
  neither credential values nor webhook URLs are copied into source.
- Slack and Discord profile databases are opened with SQLite `mode=ro`.
  Only job names/IDs and execution receipt metadata are read; no prompts,
  transcripts, tool results, or raw errors are sent.
- Receipt statuses `error` and `interrupted` open an incident; the next `ok`
  closes it. Repeated failures within the same incident do not send repeats.
  `skipped` and `superseded` do not open or resolve an incident.
- The first scan establishes a current-time baseline. It does not replay old
  failures from before installation. Newly completed manual runs are included,
  even for disabled test jobs.
- Events are saved before sending, retried on subsequent invocations, and use
  stable Slack `client_msg_id` values. A crash after Slack accepts a message but
  before the receipt is saved can still produce a duplicate; delivery is not
  claimed to be exactly once.

Native alerts and watchdog alerts are intentionally independent, so an incident
can generate two messages. Watchdog cards identify their source as `独立检查器`.
This is a completed-receipt monitor, not external host-uptime monitoring: a host
outage, a run that never finishes, or a missing execution receipt needs separate
monitoring. Watcher/SQLite/Slack failures produce a failed systemd unit and retry
on the next timer invocation; the watcher cannot guarantee notification when its
own host or Slack is unavailable.

## Reproducible installation configuration

The watcher reads this shape from its root-only configuration (use the actual
installed paths; do not copy credentials into this file):

```json
{
  "stateDirectory": "/var/lib/nori-cron-monitor",
  "channelId": "C0CG9BQQ4Q0",
  "credentialsFile": "/etc/nori-report.credentials.json",
  "profiles": [
    {"name": "slack", "database": "/home/ubuntu/rein-agent/runtime/openclaw/state/openclaw.sqlite"},
    {"name": "discord", "database": "/home/ubuntu/rein-agent/runtime/discord-catalog-prod/state/state/openclaw.sqlite"}
  ]
}
```

Install the Python file under `/opt/nori-updater` and the service/timer under
`/etc/systemd/system`; create `/var/lib/nori-cron-monitor` as root with mode 0700.
Validate the units, reload systemd, run the service once to establish its baseline,
then enable the timer. Preserve any existing state and backups on upgrades.
The existing bot must be able to post to the configured Slack channel.

For native formatting, add the installed plugin directory to `plugins.load.paths`,
append `rein-cron-alert-format` to `plugins.allow`, and merge this entry into
`plugins.entries` without replacing other plugins:

```json
{
  "rein-cron-alert-format": {
    "enabled": true,
    "config": {"channelId": "C0CG9BQQ4Q0"}
  }
}
```

Validate through the profile launcher and inspect `rein-cron-alert-format` with
`plugins inspect --runtime --json`. Disable only this entry to revert native
formatting; native alert delivery continues with upstream's original text.

## Operations

```sh
sudo systemctl status nori-cron-monitor.timer
sudo systemctl show nori-cron-monitor.service -p Result -p ExecMainStatus
sudo journalctl -u nori-cron-monitor.service -n 20 --no-pager
```

Controllers and systemd units are outside application releases. Future changes
require explicit installation from reviewed source; application PR merges alone
do not update these files. Coordinate installation with the updater lock.

To stop the independent watcher, disable and stop its timer. To remove native
alerts, change only `cron.failureAlert` through the supported config interface;
do not restore an entire old config over unrelated changes. Preserve the outbox
and incident state when upgrading or temporarily pausing the watcher.

## Validation

Local tests (`python3 tests/nori-cron-monitor.test.py`) cover first failure,
repeat suppression, recovery, a new incident after recovery, durable delivery
retry, completion ordering, and refusal to create missing runtime databases.
Systemd unit verification and production config validation passed.
The Python suite is also invoked by `tests/nori-cron-monitor.test.mjs` under the
default `pnpm test` command. `tests/cron-alert-format.test.mjs` covers native
failure/recovery presentation, routing boundaries, timezone conversion and
untrusted-text escaping.

Live acceptance uses the disabled, explicitly named
`TEST-cron-alert-acceptance-20261107` job. A harmless command exits 23, then is
replaced with `/bin/true` and rerun. It never modifies member or business data.

- Native first-failure message: [Slack receipt](https://reinprotocolf-e2q1425.slack.com/archives/C0CG9BQQ4Q0/p1794034134758249).
- Watchdog failure message: [Slack receipt](https://reinprotocolf-e2q1425.slack.com/archives/C0CG9BQQ4Q0/p1794034147726889).
- Native recovery message: [Slack receipt](https://reinprotocolf-e2q1425.slack.com/archives/C0CG9BQQ4Q0/p1794034158285609).
- Watchdog recovery message, sent by the timer without manual invocation:
  [Slack receipt](https://reinprotocolf-e2q1425.slack.com/archives/C0CG9BQQ4Q0/p1794034208750819).

All four messages were independently read back from Slack. The test job remains
disabled with a harmless `/bin/true` payload and its run history retained.

The original `skill-collection-review-main` automation was rerun at
2026-11-06 22:49:25 PST and completed successfully at 22:49:50 PST (25.198 seconds).
The scheduler reported `status: ok`, `completionStatus: succeeded`, and
`summary: NO_REPLY`; no normal-output delivery was requested. The existing weekly
schedule was retained. The previous empty-tool-allowlist failure did not recur.

## Readability update — 2026-11-06 23:03 PST

Native alerts now use `plugins/rein-cron-alert-format`, installed in the preserved
`runtime/cron-alert-format` directory and enabled via the Slack gateway's plugin
configuration. Its `message_sending` hook formats only recognized native Cron
failure/recovery notices addressed to `nori-alerts`; other messages pass through.
It does not replace the native incident state, delivery or retry behavior.

Both paths now show Chinese status headings, explicit test labels, task name,
local America/Los_Angeles timestamps and a Dashboard link. The independent
watchdog uses Slack Block Kit with a header, compact fields, a link button and
the job UUID in secondary context. Dynamic card text is plain text to prevent
unintended Slack mentions or formatting. Native notices retain their failure
reason and consecutive-error count, with metadata below the primary content.
Old queued watchdog notices remain deliverable using their original text.

The earlier acceptance job was no longer present when this update was tested.
A new disabled `TEST-告警格式验收` job was used for the same harmless exit-23 /
exit-0 exercise. Both native messages and the watchdog failure card were read
back from Slack:

- [Native failure](https://reinprotocolf-e2q1425.slack.com/archives/C0CG9BQQ4Q0/p1794034968237799)
- [Watchdog failure card](https://reinprotocolf-e2q1425.slack.com/archives/C0CG9BQQ4Q0/p1794034985279709)
- [Native recovery](https://reinprotocolf-e2q1425.slack.com/archives/C0CG9BQQ4Q0/p1794034989547349)
- [Watchdog recovery card](https://reinprotocolf-e2q1425.slack.com/archives/C0CG9BQQ4Q0/p1794035012378469)

The plugin configuration hot-loaded; no gateway restart was needed. The watchdog
executable was backed up before installation. Unit checks for monitor incident
handling/retries and targeted formatter checks (timezone, destination filtering,
ordinary-message pass-through) passed.

PR preparation also verified the plugin with the real pinned OpenClaw runtime
in an isolated temporary configuration: `status: loaded`, `imported: true`, one
`message_sending` hook, and no diagnostics. No production account was used for
that loader check.
