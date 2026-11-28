# Nori product acceptance

The [Nori acceptance skill](../../../workspace/skills/nori-acceptance/SKILL.md) connects a task's observable outcomes to collected evidence, execution verdicts, and a separate reviewer decision. It runs offline with the repository's supported Node version. Signed review additionally uses the system OpenSSH `ssh-keygen` with SSH signature support. The core workflow uses no LobeHub client, account, API, or service.

## Prepare the run

Run the CLI from an authorized local or OCI shell. Use an existing private local directory outside Git and shared workspace memory. The default store is `$HOME/.nori-acceptance`. To select another store, pass `--store` to executor commands. Its parent must already exist. On Linux, use the physical path to the receipt and evidence files.

The operator chooses the reviewer before collection using a trusted assignment. The operator must verify the individual's OpenSSH signing public key through an authenticated channel. The signer keeps the matching private key and its agent socket inaccessible to Nori. This lets the reviewer sign from a separate workstation even if the reporter and reviewer share an account on the OCI host. Alternatively, use an existing, distinct authorized POSIX principal on the same host by replacing `reviewerSsh` with an integer `reviewerUid`.

The executor owns the local store. Protect the executor account, store, and task plan from unauthorized modification. Files are owner-readable with no write bit, directories are owner-only, and the CLI publishes each record once. An OS administrator or anyone with equivalent access to the executor account can still change filesystem state. Reviewer SSH signatures can be verified against the independently entrusted public key.

Save a plan privately before taking the product action. The following is a synthetic fixture. Replace the illustrative file path and public key with the actual approved values for the fixture.

```json
{
  "objective": "Read back the new state after changing a synthetic product record.",
  "links": {
    "task": "fixture-task",
    "linear": "TEST-42",
    "github": "fixture/example#42"
  },
  "requester": "fixture-requester",
  "resourceOwner": "fixture-owner",
  "reviewerSsh": {
    "principal": "fixture-reviewer",
    "publicKey": "ssh-ed25519 REPLACE_WITH_VERIFIED_PUBLIC_KEY"
  },
  "items": [
    {
      "id": "readback",
      "expected": "The local product record shows the completed state.",
      "environment": "local-synthetic",
      "requiredEvidence": ["readback"],
      "check": {
        "kind": "file-text-equals",
        "path": "/absolute/private/fixture.txt",
        "expected": "completed\n"
      }
    }
  ]
}
```

The reviewer assignment applies to every item. `links.task` is required. Add Linear and GitHub references when connected, using the existing Task and issue IDs or URLs. The CLI preserves the references locally and makes zero remote issue writes. If a permitted issue needs a reference, use the report ID and round number with a summary allowed for that issue audience. Local paths, packet contents, signatures, and media remain private unless individually authorized.

The report derives the executor, represented principal, and credential account for local collection from the effective OS UID. The plan records the requester, resource owner, reviewer audience, and optional `costAttribution`, which defaults to `unknown`. For externally collected observations, use the existing tool's authoritative account and authorization checks. Put the actual requester, executor, represented principal, credential account, resource owner, cost, scope, and audience in the private observation or accompanying authorized evidence when they differ. A local UID authenticates the CLI process, and a tool's source evidence establishes its external account. Check delegated permissions in the source system before acting and stop when authorization is revoked or expires.

```sh
acceptance="$PWD/workspace/skills/nori-acceptance/scripts/acceptance.mjs"
node "$acceptance" start --plan "$PRIVATE/plan.json"
node "$acceptance" show --report "$REPORT_ID"
node "$acceptance" record --report "$REPORT_ID" --round 1
node "$acceptance" show --report "$REPORT_ID" --round 1
```

Use the report ID from `start`. Run authorized mutations before `record`. The fixture's optional `file-text-equals` check reads an absolute path, compares actual bytes, and preserves the readback even if it differs or is empty. An unavailable readback becomes `blocked`. The rendered `show` output opens in a terminal. `show --format json` includes the same round, evidence digests, and recorded review status in a machine-readable view.

## Collect from an existing tool

For API, browser, and other CLI observations, omit `check` for that item. Use the authorized tool directly and save the actual readback, output, or media privately. Supply `record --results "$PRIVATE/results.json"` with a JSON object keyed by item ID. Each item may use the following fields.

```json
{
  "readback": {
    "verdict": "pass",
    "observation": "A separate read showed the requested fixture state and matched the record ID.",
    "limit": "Fixture tenancy only.",
    "evidence": [
      {"type": "readback", "path": "/absolute/private/readback.json"}
    ]
  }
}
```

The collector accepts `readback`, `product-output`, `screenshot`, `recording`, and `engineering` evidence. Captured local files are copied by digest inside the store, up to 32 MiB each, and can be read back with `artifact --report ID --round N --digest SHA256`. Provide the required evidence types declared in the plan. When required evidence is missing, any proposed pass or fail verdict becomes `uncertain`. Engineering output can supplement an item and each item also requires product evidence. The collector checks presence and integrity of external files. Assigning the correct type and judging whether the contents establish the outcome remain part of performing and reviewing the acceptance. If a tool cannot run, record the blockage and its reason. Keep raw tokens, credentials, and unrelated data out of retained evidence.

## Review and retest

Keep the exported packet exact so its SHA-256 matches the stored round. The executor should export from a private shell with a restrictive umask.

```sh
umask 077
node "$acceptance" show --report "$REPORT_ID" --round 1 --format packet > "$PRIVATE/round-1.json"
node "$acceptance" artifact --report "$REPORT_ID" --round 1 --digest "$EVIDENCE_SHA" > "$PRIVATE/selected-evidence"
```

Only export evidence selected for this reviewer. Provide the packet and selected evidence through the already authorized private handoff. Keep the private store inaccessible to other principals.

For SSH signing, the reviewer retrieves the packet through their authorized private connection, opens the report and verifies the selected evidence's hashes and observed outcomes on the trusted workstation. The reviewer writes feedback JSON such as `{"note":"Correct the product state and collect another readback.","affected":["readback"]}` and runs the same repository CLI on their workstation. An accepted decision uses `--decision accept`, a note, and no affected items. A returned decision uses `--decision return` and lists the affected item IDs.

```sh
node "$acceptance" review --packet "$PRIVATE/round-1.json" --decision return \
  --feedback "$PRIVATE/feedback.json" --receipt "$PRIVATE/round-1.receipt.json" \
  --signing-key "$REVIEWER_SIGNING_KEY"
```

Supply the absolute path to the reviewer's private key or to the corresponding public key when their own SSH agent holds the private key. For a passphrase-protected key, use the reviewer's existing login terminal or SSH agent. The CLI verifies the signature under the key from the packet. The reviewer returns only the signed receipt through the approved private connection. The executor verifies that receipt against its stored round and pinned reviewer key.

For POSIX review, a host operator can provision an explicit named-user ACL or protected group handoff. Give the assigned reviewer read access to the exported packet and selected evidence. The reviewer runs the same review command under their own effective UID without `--signing-key`, writing the receipt in their own directory. Grant the executor read and traverse access only as needed for that receipt and its parent. For a preauthorized group handoff, grant read access to the assigned group and use mode `0440` on the receipt. Preserve the reviewer UID as file owner and leave group and other write permissions clear. The executor imports that exact file. Copying it as the executor replaces ownership and fails authentication.

```sh
node "$acceptance" ingest-review --report "$REPORT_ID" --receipt "$APPROVED_RECEIPT"
node "$acceptance" show --report "$REPORT_ID" --round 1
node "$acceptance" rerun --report "$REPORT_ID" --from 1 --change "fixture change or verified fix reference"
node "$acceptance" record --report "$REPORT_ID" --round 2
node "$acceptance" show --report "$REPORT_ID" --round 2
```

Prepare the rerun after reading reviewer feedback so every returned item is included. Add `--affected ITEM` for separately invalidated items, repeating it as needed. Record only the affected item observations in the new round. The new round links its source round, fix reference, and feedback digest and carries forward earlier evidence for unaffected items. Use separate review packets and receipts for each round. A passing round displays `passed` and `awaiting_review` until the authorized reviewer accepts it. An immutable round's original packet and evidence remain available after a return and after a successful retest.

The default paths retain reports, artifacts, and feedback outside Git. Protect any exported copies using the same audience controls. The CLI neither changes host permissions for reviewers nor performs network transfers. An authorized operator supplies the actual local handoff or private transfer.

## Verify locally

```sh
node --test tests/nori-acceptance.test.mjs
```

The synthetic fixture uses a temporary store and throwaway reviewer keys to exercise real local file readback, report creation, receipt verification, return, and affected-only retest, along with missing evidence, permissions, and preserved rounds. A real task separately requires evidence from its actual environment and an authorized human reviewer.
