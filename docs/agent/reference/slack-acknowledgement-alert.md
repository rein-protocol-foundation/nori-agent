# Slack 👀 acknowledgement deadline

The Slack gateway observes native message admission and Slack's authenticated response to the bot's `reactions.add` call. Both observations are written to a local SQLite ledger under the same opaque message key. The key includes the installation workspace, Slack conversation and original message timestamp. The exporter sends the event kind, key and timing to Axiom. The ledger and exported events contain no message content, Slack token or channel member names.

## Production rule

For an admitted Slack request, the deadline is the original Slack message timestamp plus 120 seconds. A confirmed 👀 at the deadline counts as timely. The independent exporter checks the ledger every second during normal operation. Once the deadline passes, a missing or late confirmation produces one persistent breach per message. A task can finish, keep running or never finish without changing the deadline decision. The production Slack profile uses the default bot account and mention-gated channels. Its DM policy is disabled.

The OpenClaw plugin observes accepted messages through the public hooks. The receipt collector uses Undici's public diagnostics channels filtered to the configured bot and the Slack `reactions.add` endpoint. It accepts only `eyes` and a successful API result or an `already_reacted` acknowledgement. The observed API response time is the confirmation time. Slack can apply the reaction before that response reaches the gateway. A later acknowledgement cannot establish an earlier time if the original response was lost.

The exporter runs as `nori-slack-acknowledgements.service` independently of gateway restarts. Pending exports are retried with the same message key. Axiom uses ingest time for its monitor window so replayed breaches remain visible. The existing monitor uses one series per Slack breach. Discord message processing and both gateway RPC groups keep their original p95 budgets and sample minimum. The monitor runs every five minutes with a two-minute ingestion delay.

## Host installation and rollback

Plugin and exporter source live in `plugins/rein-slack-acknowledgements/`. The host loads the plugin from `/opt/nori-slack-acknowledgements`. Pending observations live under `/var/lib/nori-slack-acknowledgements`, outside the replaceable checkout. The exporter uses the restricted `/etc/nori-slack-acknowledgements.env` ingest credential. The Slack bot token stays in the Slack gateway.

To roll back, restore the former Axiom query and description, remove this plugin's entry, allowlist item and load path from the **current** Slack profile, and restart the Slack gateway. Disable the acknowledgement exporter and retain the ledger and the dated pre-cutover config under `/var/backups/nori-slack-acknowledgements/`. Coordinate profile edits with the updater lock.

Former Axiom query for monitor `eWp4aVfHFuP1lqLpYg`:

```kusto
['nori-traces']
| where ['service.name'] in ('nori-slack', 'nori-discord') and ['resource.deployment.environment.name'] == 'production'
| where name in ('openclaw.message.processed', 'openclaw.gateway.rpc.response')
| extend latency_ratio = (duration / 1ms) / iff(name == 'openclaw.message.processed', 120000.0, 5000.0)
| summarize p95_budget_ratio = iff(count() >= 5, percentile(latency_ratio, 95), 0.0) by ['service.name'], name
```
