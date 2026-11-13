# Daily Nori AI receipt — SA-OBS-02 / #68

Owner: Codex. Date: 2026-11-12, America/Los_Angeles.
This is the daily receipt slice of #68, not completion of channel attribution,
Axiom dashboards or allowance alerts. Apply through a dedicated PR.

## Coverage correction under verification — November 12, 2026

The original gateway-only receipt is **not total Nori usage**. A read-only audit
of all registered agent databases in the Slack, Discord and director-pilot
profiles found direct Qwen calls outside Magpie. The isolated ACP account also
has Codex usage outside both Magpie and ordinary OpenClaw assistant usage rows.
The OpenAI account screenshot originally compared with the weekly receipt was
confirmed by the operator to be **local OpenCode usage**, not Nori. Do not import
account-wide totals or unrelated CLI/development usage into Nori receipts.

The follow-up keeps existing prices and the Provider → model layout. Unknown
items remain explicit; the total displays the known subtotal with a superscript
`*` and an exclusion footnote. Historical Bailian `auto` rows that contain no
actual served-model identity cannot be assigned a guessed model or price. A
separate failed, zero-token request is counted as $0 under the operator-approved
reporting policy: identified model, failed request, explicit zero input/output/cache
counters, zero reasoning and zero recorded cost. Missing counters, unresolved
models and nonzero usage remain unpriced. The source ledger is not rewritten.

The optional `--sources-config` supplements gateway records using explicit
trusted profile roots and their native `agent_databases` registries, rather than
a fixed list of agents or a channel filter. See
[source configuration](../config/nori-usage-sources.example.json). A profile root
is the OpenClaw state root: its registry is `state/openclaw.sqlite`. Do not point
it at a backup, release copy or generic home directory. Database reads are
read-only, including compressed transcript payloads. Gateway-routed transcript
usage must not be added a second time. An explicit refresh submits only owned,
deduplicated direct requests to Magpie's native reported-usage API, omitting
cost so Magpie applies its own catalog and configuration. Stable opaque request
IDs make retries idempotent. The report reads only the exact owned request-ID
set, not all reported/log usage. No prices or duplicate pricer are embedded in
receipt code. A native offline check confirmed historical GPT-5.4 Mini and Codex
auto-review price correctly even when absent from the current model picker.

Native aggregate usage APIs do not supply the per-call identity needed for this
cross-source accounting join, and do not cover the separate isolated Codex home.
The bounded metadata reader therefore follows the pinned native SQLite/journal
formats. It does not modify OpenClaw, restore archived conversations, replace
channels or disable memory. Reset/deleted and cold archives require verified
checksums and the same identity deduplication as current rows. Unsupported,
unreadable or conflicting evidence is a coverage gap, not zero usage.

Codex roots require explicit Nori ownership and the expected `acpx` originator.
Standalone Codex/OpenCode calls are excluded. The isolated ACP account retains
its private transcript permissions. Its exporter emits only usage metadata and
opaque deduplication keys; no prompts, responses or raw session IDs leave the
account. See [export configuration](../config/nori-codex-usage-export.example.json).
The sender's optional `sourceExports` invokes this fixed exporter as the named
account with `sudo -n -u`, feeds the fixed repository exporter to Node over stdin,
captures sanitized stdout and atomically writes a 0600
import file owned by the receipt runner. It does not grant new sudo rights or
relax transcript or checkout ACLs. The isolated account uses its already-installed
Node binary; no second copy of the exporter is installed. Export failure stops generation before sending; imports
must match the requested interval, expected owner and freshness limit.

Example optional fields in the private sender configuration:

```json
{
  "sourcesConfig": "/home/ubuntu/rein-agent/runtime/daily-agent-receipt/sources.json",
  "refreshSources": true,
  "sourceExports": [{
    "user": "nori-acp-pilot",
    "nodeExecutable": "/opt/nori-acp-pilot/node",
    "configPath": "/var/lib/nori-acp-pilot/usage-export.json",
    "outputPath": "/home/ubuntu/rein-agent/runtime/daily-agent-receipt/imports/acp.json"
  }]
}
```

`refreshSources: true` explicitly enables local accounting writes before
rendering, including sender previews. Calling the renderer directly remains
read-only; use it for a preview without ingestion. Refresh failures stop before
delivery. No provider request, route selection or price-setting change is needed.

The native daily schedule and durable delivery keys remain unchanged. Remove
these optional fields to restore gateway-only reporting; retain existing send
receipts and native reported history and mark the reduced coverage honestly.
Do not reset the Magpie ledger to undo a reporting configuration. Source collection, synthetic
tests, a production preview and an actual scheduled delivery are separate gates.
PR #78 deployed as `262878681fa6` at 2026-11-13 02:44:06 UTC with all four
services healthy. Private source configuration uses the actual receipt runner
UID (1001 on this host); isolated export/config permissions remain 0600. Native
backfill for November 5–11 accepted 94 records, then accepted 0 / skipped 94.
Seven daily previews and the integrated sender preview passed; provider/channel
configurations remained byte-for-byte unchanged. No correction was sent.

The corrected week totals 479 attempts, 14,520,939 tokens and $1.0706050245 known
estimated cost. Four unpriced records remain: three unresolved Bailian `auto`
attempts and one zero-token attempt marked unpriced by the native ledger.
The November 5 preview now includes OpenAI GPT-5.4 Mini and Codex auto-review;
the November 6 preview verifies the superscript/footnote. Evidence is private
under `runtime/daily-agent-receipt/coverage-preview/` and `coverage-refresh-*.json`.
The previous private sender configuration is retained as a timestamped
`config.before-coverage-*.json` for rollback. Restore it to disable supplemental
collection; retain the append-only ledger and all delivery history.

The original job completed successfully on November 12 at 09:00 LA and remains
enabled for November 13 at 09:00 LA. First scheduled delivery with the expanded
sources remains pending; manual preview is not scheduled-delivery acceptance.

## Existing gateway-only behavior and scope

At **09:00 America/Los_Angeles**, a native OpenClaw command automation renders
the **previous local calendar day** and sends its PNG to **#nori-alerts**
(`C0CG9BQQ4Q0`) using Nori's existing Slack account. The schedule and the data
window both use the IANA timezone, including 23/25-hour DST days. No model call
or image generation service is needed. The schedule is optional and removable.

Magpie's community [Day Card](https://github.com/magpie-community/plugins/tree/main/packages/day-card)
provides the reference receipt layout. The user chose a server adaptation of its
style and icons. Nori uses an independent SVG renderer with pinned `@resvg/resvg-js`,
not the stock desktop plugin's Canvas renderer. The desktop plugin requires Magpie
>=0.1.3427 and has no server export/scheduling interface; its native data groups by
Agent and truncates group lists. Nori retains its pinned gateway and reads complete
paginated `GET /v1/magpie/usage/requests` data with `via=through`.

The main body groups **Provider → model IDs**, with provider subtotals, brand icons
and USD estimates. Only providers/models with requests in the selected day appear.
Per-model rows contain costs only; total tokens, uncached input, output, cache-hit
percentage and the number of requests without a matched price appear at the bottom.
Unknown pricing remains an explicit configuration/data-quality gap, never a zero
price or an assertion that the model has no published API rate. The report uses
Magpie's native catalog/configuration prices and contains no hardcoded model rates.
It says **Magpie catalog estimate, not a bill**; subscription cash charges are excluded.
Magpie's uncached input, cache reads and cache writes are combined once; reasoning
is already within output. Requests forwarded through multiple attempts remain
individual attempts. Direct session-log/reported usage is excluded so it cannot
duplicate gateway records. Native ACP calls that bypass Magpie are outside coverage.

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

## Provider-group layout follow-up — November 12, 2026

Owner: Codex. Status: **DEPLOYED / MANUAL LIVE VERIFIED**.
The user selected Day Card style/icon reuse with the existing server sender,
active-day groups only. [PR #75](https://github.com/rein-protocol-foundation/nori-agent/pull/75)
passed all CI and deployed as `33c44dc268b590acf1d92c8af7afeae1bf7ce9ae`
on November 12 at 10:38:56 UTC. Four app services passed health checks.
Targeted Node 13/13, direct Python sender 12/12, scaffold/diff and actual/synthetic
visual previews passed. Multi-provider, same-model/two-provider, >12 groups,
long-ID wrapping and icon rasterization are covered.

The November 11 production preview shows 44 requests, $0.0760, 1,207,998 tokens,
89.6% cache hits and 0 unpriced requests. Nori delivered `provider-v3`, file
`F0CH5NH47Q9`, message `1794480068.252469`; independent Slack channel/file read-back
confirmed it. [Corrected receipt](https://app.slack.com/archives/C0CG9BQQ4Q0/p1794480068252469).
Rerunning the same revision returned `already-sent`. Original, `pricing-v2` and
`provider-v3` records all remain `sent`; no original record or image was deleted.
The existing daily schedule is unchanged; first clock-triggered acceptance remains pending.

### Native price audit correction

`bailian-token-plan → alibaba-cn` and `openai → openai` were already configured,
including Qwen/DeepSeek and GPT Sol/Astra. An earlier direct catalog lookup wrongly
interpreted the absent `catalog` on `gemini` and `chatgpt-api` as missing prices.
These are stored subscription-account model selections, not custom API providers.
The pinned native `withPicks` does not merge a catalog override for them, and
`EffectivePriceIn` falls back to `MakerPrice` when no provider tariff applies.
Google/OpenAI maker prices already cover their current model IDs.

An attempted `provider set gemini catalog=google` returned nonzero; the maintenance
script restored the original providers file byte-for-byte and restarted Router.
No catalog change, provider endpoint change, credential change or model replacement
was retained. A subsequent isolated **native usage-ledger** audit used the original
public provider metadata/catalog and nonzero synthetic usage, without credentials
or inference. Native `usage --csv all` priced 10/11 configured provider/model entries
with **no added alias mappings**, including every still-served configured model.
This is stronger evidence than checking one catalog JSON key or invoking a CLI
lookup against an unavailable subscription account. No live usage was rewritten.

The only stale model entry is `gemini-3-pro-preview`: Google's
[model page](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-preview)
says it shut down on March 9, 2026; no live ledger request names it. Google's
[launch post](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-3-developers/)
confirms its former basic input/output rates, but a complete verified historical
cache/context-tier configuration remains pending. Do not substitute another
model's price or silently remove the operator's selected model.

Three earlier ledger attempts record requested and served model as `auto`; those
fields do not identify the actual model and they lie outside November 11.
The native `priced` flag is also false on observed zero-token failed attempts.
The footer faithfully reports the flag; it does not assert that a model has no
published API rate. Unknown mappings/data must not become fabricated zero prices.
Catalog mappings and verified rate overrides belong in private Magpie configuration,
never renderer code. No broader SA-OBS-02 milestone is completed by this follow-up.
