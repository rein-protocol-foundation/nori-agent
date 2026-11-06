# Nori observability with Axiom

Current rollout status and alert-delivery gaps are documented in the
[Chinese status and operations report](observability-status-zh.md)
(last checked 2026-11-05 22:59 America/Los_Angeles). The three monitors currently
show `Normal` and `No notifiers`; Slack alert delivery is not yet connected.

Operational support for PRD US14 (exception handling) and US15 (recovery):
OpenClaw's official `diagnostics-otel` plugin collects and exports gateway
diagnostics over OTLP/HTTP protobuf. This does not establish business-workflow
acceptance or instrument the separate Router, dashboard, updater, or backend.

## Install the compatible exporter

Use the repository wrapper so the operation targets the project's state directory:

```sh
npm run toolchain:pnpm -- openclaw plugins install @openclaw/diagnostics-otel
```

The latest registry package can require a newer plugin API than the pinned host.
Check the host version before upgrading anything. For host `2026.9.5`, the
corresponding package spec is `@openclaw/diagnostics-otel@2026.9.5`.
Source builds already include `vendor/openclaw/dist/extensions/diagnostics-otel`.
When the runtime rejects a registry artifact's SDK build identity and retains the
bundled plugin, use that bundled build. Do not force-load an incompatible package
or modify the upstream submodule. A duplicate registry install must be reconciled
before treating `plugins doctor` as clean.

## Axiom prerequisites

Create three dedicated datasets in the intended edge deployment:

| Dataset | Kind | OTLP header |
| --- | --- | --- |
| `nori-traces` | Events (`axiom:events:v1`) | `x-axiom-dataset` |
| `nori-logs` | Events (`axiom:events:v1`) | `x-axiom-dataset` |
| `nori-metrics` | Metrics (`otel:metrics:v1`) | `x-axiom-metrics-dataset` |

The exporter token needs ingestion access to all three datasets. Creating datasets
through the API additionally requires `datasets:create`; read access alone is not
sufficient. Axiom token permissions are immutable after creation. If an existing
token already permits ingestion to the target datasets, create the datasets through
an authorized Console session and reuse the token; no management permission is
needed in the exporter. Basic ingest tokens cannot query telemetry, so verify data
through Console or a separate authorized query credential.

Use the organization's retention policy. The example endpoint is US East 1;
select the endpoint matching the actual datasets. In Console, the `Nori Observability`
correlation group (`nori`) connects these three datasets for cross-signal navigation.

## Configure each gateway profile

Merge [the JSON fragment](../config/axiom-otel.example.json) into the private
OpenClaw configuration. **Append** `diagnostics-otel` to the existing allowlist;
preserve other plugins, channels, authentication, and diagnostics settings.
Use distinct service names: `nori-slack`, `nori-discord`, and `nori-local`.

Merge [the environment example](../config/axiom-otel.env.example) into that
profile's `OPENCLAW_STATE_DIR/.env`, with mode `0600`. Copy only `AXIOM_API_TOKEN`
from the private repository `.env.local`; the backend environment loader deliberately
does not pass all repository credentials to OpenClaw. The JSON holds an environment
reference, never the token itself. For OCI, set the resource environment to `production`.

| Profile | Config relative to repository | Environment relative to repository |
| --- | --- | --- |
| Local / OCI Slack | `runtime/openclaw/openclaw.json` | `runtime/openclaw/.env` |
| OCI Discord | `runtime/discord-catalog-prod/openclaw.json` | `runtime/discord-catalog-prod/state/.env` |

The pinned plugin merges signal-specific environment headers with the common
Authorization header. Do not put a shared `x-axiom-dataset` in the JSON: it would
override the distinct log and trace routing. Metrics export every 60 seconds;
traces use full sampling. `captureContent: false` suppresses message content,
tool inputs/outputs, and log bodies; diagnostic metadata and redacted error details
can still be exported. This is telemetry, not a copy of conversation transcripts.

Back up each affected private config and environment file before changing it.
On OCI, coordinate with the updater lock, preserve `runtime/`, and restart only
the affected gateways, one at a time. Private profile state survives normal releases;
the bundled exporter follows the pinned OpenClaw build.

## Verify and roll back

1. Validate the profile with `openclaw config validate` and inspect
   `openclaw plugins inspect diagnostics-otel --runtime --json` through its launcher.
2. Run `openclaw plugins doctor`; resolve exporter load failures before restarting.
3. Check the existing authenticated gateway health probe after restart.
4. Check Axiom for recent logs and traces grouped by `service.name`, and the
   `nori-metrics` catalog after at least one export interval. Do not equate an
   enabled plugin or HTTP acceptance of a synthetic probe with live gateway export.
5. Do not send chat messages or trigger business writes just to generate telemetry.

To disable export, set `diagnostics.otel.enabled` to `false` and restart the affected
gateway. To undo the configuration, restore that profile's private backups. Do not
replace a live profile with the example or roll back unrelated runtime state.

References: [OpenClaw diagnostics](https://docs.openclaw.ai/logging),
[Axiom OTLP configuration](https://axiom.co/docs/send-data/opentelemetry),
[Axiom edge deployments](https://axiom.co/docs/reference/edge-deployments).

## Activation evidence — 2026-11-05

Local, OCI Slack, and OCI Discord configuration validation and `plugins doctor`
passed. Runtime inspection loaded the bundled `diagnostics-otel` version
`2026.9.5`, with all dependencies present. Both OCI gateways returned HTTP 200
from `/readyz` after configuration; Discord needed an explicit service start
because its config-triggered supervisor restart exited successfully while systemd
was configured with `Restart=on-failure`.

The repository checks passed; the local suite passed 1,223 tests with two skipped
and zero failures. The provided token could list datasets but creation returned
HTTP 403 for `datasets:create`. The three datasets were subsequently created
through the authorized Axiom Console session, together with the `nori` correlation
group. Existing ingestion permission was sufficient; the token was not replaced
or broadened. All three OTLP endpoints accepted verification payloads with HTTP 200.

Export is now enabled for local development and both OCI profiles. After the
concurrent updater completed, Slack and Discord were restarted one at a time.
Both passed `/readyz` and authenticated `rein_status` probes; both remained active
with zero systemd restarts and no exporter errors in the post-activation journal.

Axiom Console confirmed actual production logs and traces for `nori-slack` and
`nori-discord`. The trace verification snapshot contained 26 and 17 spans,
respectively. The metrics query below returned production series for both services,
including `channels.status` and `skills.status` RPC requests:

```text
`nori-metrics`:`openclaw.gateway.rpc.requests`
| align to $__interval using avg
```

An isolated local gateway (`nori-setup-check`, environment `verification`) also
validated the exporter and was stopped afterward. No chat messages or business
writes were needed for verification. Conversation content capture remains disabled.

## Dashboard and alerting — 2026-11-05

[Nori Observability](https://app.axiom.co/rein-protocol-foundation-qzel/dashboards/uid/nori-observability)
contains six panels: completed requests, error rate, and p50/p95 latency for
message processing and gateway RPC responses, separately. Each panel groups
`nori-slack` and `nori-discord`, filtering
`resource.deployment.environment.name == "production"`. Counts use the displayed
time bucket; latency converts the Axiom timespan `duration` with `duration / 1ms`.

Message panels select `name == "openclaw.message.processed"`. RPC panels select
`name == "openclaw.gateway.rpc.response"`; this includes health/control traffic
and must not be interpreted as user message volume. Custom OpenClaw attributes
are in the dynamic field `['attributes.custom']`, for example
`tostring(['attributes.custom']['openclaw.outcome'])`. Failed outcomes and the
standard `error` flag both count as errors. These panels cover completed
observations; absent series do not establish health or detect stuck requests.

The following threshold monitors evaluate each service and operation separately:

| Monitor | Trigger | Recovery |
| --- | --- | --- |
| [High error rate](https://app.axiom.co/rein-protocol-foundation-qzel/monitors/view/qMrqLHeEcF5qNJz5zl) | At least 5% failures with at least 20 requests | Below 3% |
| [Repeated failures](https://app.axiom.co/rein-protocol-foundation-qzel/monitors/view/QlYPNmL3uvRzMaPD3B) | At least 3 failures | Zero failures |
| [High p95 latency](https://app.axiom.co/rein-protocol-foundation-qzel/monitors/view/eWp4aVfHFuP1lqLpYg) | Message p95 at least 120s, or RPC p95 at least 5s; at least 5 requests | Below 80% of the applicable latency budget |

All use a 15-minute window, run every 5 minutes, and delay evaluation by 120
seconds to accommodate export/ingestion. Group notifications and recovery
notifications are enabled; repeated notifications and no-data alerts are disabled.
These are initial operational thresholds, not an agreed service-level objective.
The latency monitor reports p95 divided by its applicable budget, with a trigger
of 1 and recovery below 0.8. Minimum-volume guards return zero when insufficient
samples exist; consult the request chart to distinguish this from measured health.

The dedicated [Slack #nori-alerts channel](https://app.slack.com/client/T0C4GRL55HB/C0CG9BQQ4Q0)
is connected through a channel-specific Incoming Webhook for the existing
**Nori - Rein Secretary** app. The enabled notifier
[Nori · Slack #nori-alerts](https://app.axiom.co/rein-protocol-foundation-qzel/notifiers?notifierId=9tFCLIVLRSPAfjj44u)
is attached to all three monitors; their notifier column now shows Slack.

On 2026-11-05 at 23:10:48 and 23:10:58 PST, Axiom's **Send test** delivered an
explicit test alert and its resolved notification to the channel. Both appeared
under the Nori app. This verifies notifier delivery for alert and recovery
messages, not the production rules' query evaluation or alert-state transitions.
No production thresholds were changed, faults injected, or gateways restarted
for this test. A controlled rule-trigger/recovery exercise remains outstanding.
The Webhook URL stays in private Slack/Axiom configuration and is not committed.
