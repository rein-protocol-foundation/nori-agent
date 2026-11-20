# Slack 👀 acknowledgement deadline

**Cutover pending · 2026-11-19.** The production latency monitor still measures Slack message processing. This is the proposed replacement for its Slack message branch.

## Event contract for the Slack adapter

The pinned OpenClaw Slack adapter (`4a11f89e`) holds the result of the native reaction call inside the adapter. Its public message hooks and OTEL delivery events do not expose the acknowledgement emoji, the original Slack message identity and a confirmed reaction timestamp together. A later read of Slack reactions confirms current membership but supplies no historical timestamp.

Extend the public diagnostic interface with two independently exported events. They must survive retries and gateway restarts. Persist each event before considering it delivered to the exporter.

- **Required.** Record the final decision that a Slack message requires a response, independently of whether a reaction is configured, attempted or succeeds. Carry the original Slack message timestamp so that processing and queue delays consume the same deadline. Include admitted DMs and addressed thread replies. Exclude denied messages, passive room traffic and events the participation policy elects to skip. The message must have a reaction target.
- **Confirmed.** Record the first trusted Slack event time for Nori's own `eyes` reaction on the original message. Match the installation, bot user, conversation and exact message timestamp. An API success observed within the deadline also proves timely delivery. A late `already_reacted` response, a current reaction list, or a late API response without a Slack event time leaves the original time uncertain. Reconcile that case with Slack's timestamped `reaction_added` event. Preserve the first confirmation if the reaction is later removed or replaced.
- **Correlation.** Export an opaque per-message key scoped to the workspace, installation, channel and original message timestamp. Preserve microsecond precision. Export event times and the correlation key without message bodies or member names. Replayed ingress and duplicate confirmations use the same key.

## Evaluation

For each required message, the deadline is its Slack timestamp plus 120 seconds. A confirmation exactly at the deadline counts. Once the deadline passes, a missing or late confirmation breaches it even if the task is still running. Use durable per-message breach records and deduplicate notifications by key. Keep telemetry delivery failure distinguishable from a verified missed acknowledgement. A finite query window alone cannot retain unresolved messages through a prolonged outage.

The following SQLite replay checks the decision with synthetic, normalized observations. Times are integer microseconds from an arbitrary origin. The receipt rows represent observations already verified for the same bot, reaction and original message. The query returns only the overdue and late cases.

```sql
WITH
  required(message_key, sent_us) AS (
    VALUES ('long-task', 0), ('boundary', 0), ('missing', 0), ('late', 0),
           ('still-waiting', 1), ('duplicate', 0), ('duplicate', 0)
  ),
  confirmed(message_key, added_us) AS (
    VALUES ('long-task', 2000000), ('boundary', 120000000),
           ('late', 120000001), ('duplicate', 2000000),
           ('duplicate', 120000001), ('unaddressed', 10)
  ),
  first_due AS (
    SELECT message_key, min(sent_us) + 120000000 AS due_us
    FROM required GROUP BY message_key
  ),
  first_receipt AS (
    SELECT message_key, min(added_us) AS first_us
    FROM confirmed GROUP BY message_key
  )
SELECT message_key
FROM first_due LEFT JOIN first_receipt USING (message_key)
WHERE 120000001 > due_us AND (first_us IS NULL OR first_us > due_us)
ORDER BY message_key;
```

## Production cutover and verification

1. Verify paired production events for a normal message. Exercise wrong-actor and wrong-message reactions, passive traffic, duplicate delivery, and restart between admission and timeout in an isolated integration test. Measure event-delivery delay separately from the 120-second user deadline.
2. Route per-message deadline breaches to the existing Slack notifier. Use one breached message as the threshold. Exercise a timely 👀 on a task lasting over 120 seconds and an overdue 👀 on an unfinished task. Verify exact-boundary behavior, one notification per breached message and recovery.
3. Save the current Axiom monitor definition. In its p95 query exclude only the pair `service.name == "nori-slack"` and `name == "openclaw.message.processed"`. Preserve the existing Discord and gateway RPC budgets, and retain processing latency on the dashboard. Read back the saved definition and verify the remaining groups. Keep the saved definition for rollback.
