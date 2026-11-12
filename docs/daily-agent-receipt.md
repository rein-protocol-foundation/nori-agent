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

The main body shows complete wrapped model names, a separate provider label,
per-model token/cache usage and estimated USD before the daily totals. Secondary
breakdowns retain Magpie client and provider totals. It says **Magpie catalog
estimate, not a bill**, and explicitly excludes subscription charges. Unknown prices stay explicit. Magpie's uncached input,
cache reads and cache writes are combined once; reasoning is already within
output. Requests forwarded through multiple attempts remain individual attempts.
Direct session-log/reported usage is excluded so it cannot duplicate gateway
records. Native ACP calls that bypass Magpie are outside coverage.

Magpie client names do not establish Nori internal Agent or Slack/Discord channel
attribution. There is no invented per-channel breakdown, streak, daily-average
comparison, subscription cash charge or missing usage estimate. No account,
credential, session identifier, request/response ID, prompt or error body is
written to the report. Only aggregate usage leaves the host.

## Native price mapping

The China `bailian-token-plan` preset in pinned Magpie has no catalog mapping.
The model `deepseek-v4.1-flash` is available in `alibaba-cn`, while maker fallback
cannot price this exact identifier in the inspected catalog. With no mapping or
price override, native usage rows report `priced: false`; that does not mean free.

New offline imports now default to `catalog: "alibaba-cn"`, preserving an existing
operator override (including an explicit empty catalog). This selects the China
API **reference price** for estimates and leaves the dedicated Token Plan endpoints,
credentials, selected models and subscription billing route intact. Existing live
profiles require a one-time native configuration update after deployment; code
updates do not overwrite private Magpie settings.

For the managed OCI profile, stop only `nori-router` to release its profile lock,
save a 0600 private rollback copy of `runtime/magpie/config/magpie/providers.json`,
and run as the service user from the active checkout:

```sh
.toolchain/node_modules/node/bin/node scripts/magpie.mjs --allow-subscription-accounts \
  provider set bailian-token-plan catalog=alibaba-cn
```

Always restart the router after the maintenance command, including on failure.
Verify the stored catalog, unchanged endpoint/key/model values, unchanged public
model inventory, service health and `priced: true` on the intended daily ledger.
Do not re-import credentials or edit the ledger to reprice historical requests.
For rollback, restore the prior catalog with the same native command (`catalog=`
when previously unset), retaining all other current provider fields and histories.

Magpie reads its [models.dev](https://models.dev/) catalog and computes costs through
its native pricer, including separate cache reads. The renderer does not inject
fallback rates. Catalog estimates use the prices available **at render time**;
they do not reconstruct historical exchange rates, time-of-day tariffs, discounts
or subscription cash charges. [Bailian's official model pricing](https://help.aliyun.com/zh/model-studio/deepseek-v4-1-flash)
includes busy/off-peak rates, which this static catalog estimate does not reproduce.
A deterministic native regression uses synthetic prices to prove missing mapping →
priced history → rollback, without inference or modifying ledger data.

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

An explicitly authorized corrected report uses a stable revision, after reading
back the original delivery and verifying the corrected preview:

```sh
python3 scripts/send-daily-agent-receipt.py --config <private-config> \
  --date 2026-11-11 --revision pricing-v2
# Only after inspecting the preview, for the authorized correction:
python3 scripts/send-daily-agent-receipt.py --config <private-config> \
  --date 2026-11-11 --revision pricing-v2 --send
```

The caption marks the correction. State uses `<day>-<channel>-revision-<revision>.json`
and artifacts use `<day>/revisions/<revision>/`; original records and PNGs remain
intact. The same revision deduplicates; unresolved delivery must be reconciled
before sending a new revision. Never choose another revision to bypass uncertainty.
The daily Cron declaration keeps its original command without `--revision`.

Disable the one job with native `cron disable <job-id>` (or Dashboard) to stop
future sends. Inspect the stored state even if the native CLI reports a known
post-commit output-schema error; do not retry blindly. Preserve config, artifacts
and receipt records across deployment/restart. This change defines no automatic
deletion/retention policy. No gateway setting, provider, model or existing
automation needs to be removed for rollback.

## Verification status

PR #72 passed all CI, merged and deployed as `831093f8bba3ba70953bdde0cd14403cabf6815c`
on 2026-11-12 at 09:19:57 UTC. Following explicit user authorization, Slack app
reauthorization completed and the active host bot's scopes now include `files:write`
and `chat:write`; existing credentials remained valid. All four application services
passed deployment health checks. Private state and the previous release are retained.

The 0600 runtime config follows the example above. Native authenticated Gateway RPC
created declaration `nori-daily-agent-receipt-v1`, job
`bd36ddb1-8aef-4fa5-b89c-c160f51797ca`, enabled for exact 09:00 America/Los_Angeles.
On this trusted-proxy deployment, the maintenance client reused the installed
updater's authenticated proxy headers over the host's existing loopback route;
no trust setting or runtime database was modified directly.
A manual native `cron.run` succeeded (exit 0, 13.862 seconds) and sent the November 11
PNG as Nori. Sender state records file `F0CH51GJH8R`; Slack channel and file read-back
confirmed message `1794475251.025539` in `C0CG9BQQ4Q0`.
[Verification message](https://app.slack.com/archives/C0CG9BQQ4Q0/p1794475251025539).
`deliveryStatus=not-requested` refers to the deliberately disabled scheduler text;
the command's own native file delivery is confirmed separately.

Next scheduled execution: November 12, 2026 at 09:00 PST (17:00 UTC). It should skip
the already-sent November 11 receipt. The next new receipt is due November 13 at
09:00 PST. **First clock-triggered acceptance remains pending.**

Local full regression passed (1324 tests, 1322 pass, 2 existing skips) in a no-space
checkout; the original checkout exposed an existing encoded-path worker test failure.
Targeted Node 10/10, nested Python sender 6/6, scaffold and all PR CI passed.
Production image rendering was visually inspected. This does not complete #68,
channel/internal-agent attribution, Axiom dashboards or quota alerts.
