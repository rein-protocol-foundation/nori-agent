# Daily Nori AI receipt — SA-OBS-02 / #68

Owner: Codex. Date: 2026-11-12, America/Los_Angeles.
This is the daily receipt slice of #68, not completion of channel attribution,
Axiom dashboards or allowance alerts. Apply through a dedicated PR.

## Behavior and scope

At **09:00 America/Los_Angeles**, a native OpenClaw command automation renders
the **previous local calendar day** and sends its PNG to **#nori-alerts**
(`C0CG9BQQ4Q0`) using Nori's existing Slack account. The schedule and the data
window both use the IANA timezone, including 23/25-hour DST days. No model call
or image generation service is needed. The schedule is optional and removable.

Magpie's community [Day Card](https://github.com/magpie-community/plugins/tree/main/packages/day-card)
supports receipt images. Its current package requires Magpie >=0.1.3427,
`usage:day` and `magpie.image`; Nori's pinned `95e7c6bcc076` lacks that read.
This slice retains the existing gateway and uses its public read-only
`GET /v1/magpie/usage/requests` interface, with `via=through`. It renders an
independent receipt using pinned `@resvg/resvg-js`, not a modified Magpie plugin.

The image shows gateway request attempts, failed attempts, token/cache totals
and costs by Magpie client, provider and model. It says **API price estimate,
not an invoice**. Unknown prices stay explicit. Magpie's uncached input,
cache reads and cache writes are combined once; reasoning is already within
output. Requests forwarded through multiple attempts remain individual attempts.
Direct session-log/reported usage is excluded so it cannot duplicate gateway
records. Native ACP calls that bypass Magpie are outside coverage.

Magpie client names do not establish Nori internal Agent or Slack/Discord channel
attribution. There is no invented per-channel breakdown, streak, daily-average
comparison, subscription cash charge or missing usage estimate. No account,
credential, session identifier, request/response ID, prompt or error body is
written to the report. Only aggregate usage leaves the host.

## Local preview and checks

```sh
npm run toolchain:pnpm -- install --frozen-lockfile
npm run toolchain:pnpm -- exec node --test tests/daily-agent-receipt.test.mjs tests/daily-agent-receipt-delivery.test.mjs
npm run toolchain:pnpm -- exec node scripts/daily-agent-receipt.mjs --date 2026-11-11 \
  --timezone America/Los_Angeles --magpie-url http://127.0.0.1:3425 \
  --output-dir runtime/daily-agent-receipt/preview
```

The generator writes sanitized JSON, SVG and PNG. It performs no send. Use
`python3 scripts/send-daily-agent-receipt.py --config <private-config>` for an
integrated preview. Sending requires the explicit `--send` switch. A system
monospaced font is required; the OCI host has DejaVu Sans Mono. The receipt uses
English labels and the Slack caption explains scope in Chinese.

## Apply after the dedicated PR is merged and deployed

The user authorized this daily delivery and destination. Do not copy feature
code directly into production before the PR is applied. Use the normal merged-PR
deployment, then configure the existing native scheduler; no new systemd timer.

1. Verify the deployed revision and service health using the normal OCI runbook.
2. Verify Nori is a member of the exact target channel and its **active Slack bot
   token has `files:write`** as well as `chat:write`. Adding a Slack app OAuth
   scope requires updating its app configuration and reinstalling/reauthorizing
   it. Preserve existing credentials; update private secret storage if Slack
   issues a replacement. A different connected Slack user's upload ability is
   not evidence that Nori can upload.
3. Create `runtime/daily-agent-receipt/config.json` (0600) from
   [the example](../config/daily-agent-receipt.example.json). Verify all paths;
   it contains locators and destination IDs, not credentials. Place artifacts
   within the native Slack profile's `media` directory, already permitted by
   OpenClaw's local attachment boundary. No broad media-root expansion.
4. Run the integrated preview and inspect the image. Then perform one authorized
   `--send` for the previous day and read the image back in Slack. A dry run,
   synthetic test or successful upload reservation is not delivery acceptance.
5. Create the native automation below using the authenticated administrator CLI
   or Dashboard. Use its declaration key to converge rather than create duplicates.
   On trusted-proxy deployments, use the existing authenticated administration
   route; do not disable gateway authentication or edit the runtime database.

Example native CLI arguments on OCI (the host's normal authenticated CLI context):

```sh
.toolchain/node_modules/node/bin/node runtime/oci-deploy/slack.mjs cron add \
  --declaration-key nori-daily-agent-receipt-v1 \
  --name nori-daily-agent-receipt --agent main --session isolated \
  --description 'SA-OBS-02: previous LA calendar-day Magpie receipt to #nori-alerts' \
  --cron '0 9 * * *' --tz America/Los_Angeles --exact \
  --command-argv '["python3","/home/ubuntu/rein-agent/scripts/send-daily-agent-receipt.py","--config","/home/ubuntu/rein-agent/runtime/daily-agent-receipt/config.json","--send"]' \
  --command-cwd /home/ubuntu/rein-agent \
  --timeout-seconds 420 --no-output-timeout-seconds 420 --output-max-bytes 4096 \
  --no-deliver
```

`--no-deliver` suppresses the scheduler's extra text delivery; the command sends
the attachment through native `message send`. Existing native Cron failure
alerts remain inherited. Verify the saved job's enabled state, executor, exact
schedule/timezone, next execution and payload through the native inventory.
The first automatically scheduled successful delivery remains a separate check.

## Delivery evidence, retry and rollback

The sender uses a process lock and a durable record keyed by day and channel.
A confirmed send records the native Slack message timestamp or uploaded file ID;
repeated invocations then return `already-sent`. It records intent **before**
sending. A timeout/crash or an invalid/partial native result leaves `sending` or
`uncertain`, and reruns refuse to blindly send again. There is no exactly-once
claim across an external Slack call and a local filesystem write.

For `sending`/`uncertain`, read the target channel and the native outbound queue
first. If delivered, reconcile the local record with the real message/file ID.
If delivery was definitively not performed and no native recovery is pending,
archive that one local record and rerun the same date. Do not delete all history
or use a new day/key merely to bypass uncertainty. Generation failures happen
before any send intent and can be retried after fixing the underlying issue.

Disable the one job with native `cron disable <job-id>` (or Dashboard) to stop
future sends. Inspect the stored state even if the native CLI reports a known
post-commit output-schema error; do not retry blindly. Preserve config, artifacts
and receipt records across deployment/restart. This change defines no automatic
deletion/retention policy. No gateway setting, provider, model or existing
automation needs to be removed for rollback.

## Verification status

Read-only production inspection confirmed the current Magpie pin and public
usage API, target channel name, membership and availability of DejaVu Sans Mono.
The active Nori bot token (also used by the reporter) lacks `files:write`; native
attachment delivery therefore requires verification/reauthorization before
activation. No production schedule, send or code installation has been performed
by this PR's preparation. Local full regression passed (1324 tests, 1322 pass, 2 existing skips) in a
no-space checkout; the original checkout exposed an existing encoded-path worker
test failure. [PR #72](https://github.com/rein-protocol-foundation/nori-agent/pull/72)
tracks CI and deployment; live image read-back and the first 09:00 run are
pending.
