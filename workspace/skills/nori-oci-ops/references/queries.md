# OCI read-only query reference

Run on the OCI host as the ordinary Nori service user. Start with `oci --version`.
The maintained host provides `/usr/local/bin/oci`; do not install another copy or
run `oci setup config` to answer a status question. IAM remains authoritative even
when a CLI command is available. Do not use an administrator credential to bypass
a denial.

## Select the current instance scope

The helper derives these values automatically. For a custom query, request
`http://169.254.169.254/opc/v2/instance/` with the header
`Authorization: Bearer Oracle`, a short timeout, and no proxy. Extract only `id`,
`compartmentId`, `tenantId`, `availabilityDomain` and `region` into task variables
such as `OCI_INSTANCE_ID`, `OCI_COMPARTMENT_ID`, `OCI_TENANCY_ID`, `OCI_AD` and
`OCI_REGION`. Do not print the full response: it may contain user-supplied metadata.
Never fetch the instance identity private key or certificate for a report.

Pass `--auth instance_principal --region "$OCI_REGION"` explicitly for custom
commands. The maintained host wrapper also supplies those defaults. Use `--help`
for the installed version's exact options. The examples below assume those scope
variables have been set from the current host, not copied from an old conversation.

## Compute and disks

```sh
oci compute instance get --auth instance_principal --region "$OCI_REGION" \
  --instance-id "$OCI_INSTANCE_ID" \
  --query 'data.{state:"lifecycle-state",shape:shape,ocpus:"shape-config".ocpus,memoryGB:"shape-config"."memory-in-gbs"}'

oci bv boot-volume list --auth instance_principal --region "$OCI_REGION" \
  --compartment-id "$OCI_COMPARTMENT_ID" --availability-domain "$OCI_AD" --all \
  --query 'data[].{name:"display-name",state:"lifecycle-state",sizeGiB:"size-in-gbs",vpus:"vpus-per-gb"}'

oci bv volume list --auth instance_principal --region "$OCI_REGION" \
  --compartment-id "$OCI_COMPARTMENT_ID" --all \
  --query 'data[].{name:"display-name",state:"lifecycle-state",sizeGiB:"size-in-gbs"}'
```

These lists describe accessible compartment resources. A volume existing in the
compartment does not mean it is attached to this instance. Use read-only boot-volume
attachment/volume attachment list commands when that distinction matters. On Linux,
`df -h /`, `lsblk`, `free -h` and `systemctl is-active` describe the guest, not cloud
billing. Report filesystem units as displayed.

## Backups

```sh
oci bv boot-volume-backup list --auth instance_principal --region "$OCI_REGION" \
  --compartment-id "$OCI_COMPARTMENT_ID" --all \
  --query 'data[].{name:"display-name",state:"lifecycle-state",type:type,created:"time-created",sourceSizeGiB:"size-in-gbs",storedGiB:"unique-size-in-gbs",expires:"expiration-time"}'

oci bv backup list --auth instance_principal --region "$OCI_REGION" \
  --compartment-id "$OCI_COMPARTMENT_ID" --all \
  --query 'data[].{name:"display-name",state:"lifecycle-state",created:"time-created",sourceSizeGiB:"size-in-gbs",storedGiB:"unique-size-in-gbs",expires:"expiration-time"}'
```

Metadata access uses `inspect volume-family`; `GetBootVolume`, `GetVolume` and
backup get/list operations do not require write access. Do not escalate to `use`
or `manage` for these queries. A null expiration field is not a durability guarantee.

## Monitoring

```sh
oci monitoring metric list --auth instance_principal --region "$OCI_REGION" \
  --compartment-id "$OCI_COMPARTMENT_ID" --namespace oci_computeagent --all \
  --query 'data[].name'

oci monitoring metric-data summarize-metrics-data \
  --auth instance_principal --region "$OCI_REGION" \
  --compartment-id "$OCI_COMPARTMENT_ID" --namespace oci_computeagent \
  --query-text "CpuUtilization[1m]{resourceId=\"$OCI_INSTANCE_ID\"}.mean()" \
  --start-time <UTC-start> --end-time <UTC-end>

oci monitoring alarm list --auth instance_principal --region "$OCI_REGION" \
  --compartment-id "$OCI_COMPARTMENT_ID" --all
```

Filter the returned fields to what the operator asked. `read metrics` permits
listing and summarizing data; it does not permit `PostMetricData`. `read alarms`
does not permit creating or changing an alarm. CPU values use percent units; retain
the timestamp and interval when reporting them.

## Costs

```sh
oci usage-api usage-summary request-summarized-usages \
  --auth instance_principal --region "$OCI_REGION" \
  --tenant-id "$OCI_TENANCY_ID" \
  --time-usage-started <YYYY-MM-DDT00:00:00Z> \
  --time-usage-ended <YYYY-MM-DDT00:00:00Z> \
  --granularity DAILY --query-type COST --group-by '["service"]'
```

This POST-based API is a read-only analytical query; HTTP method alone does not
determine whether an operation mutates resources. It requires `read usage-report`
at tenancy scope. Do not substitute `manage usage-report`, which also permits saved
report changes. Follow `opc-next-page` using `--page` if present; do not silently
present a partial page as a complete bill. The CLI includes `opc-next-page` in its
default JSON output when present; the bundled helper follows that pagination.

Group and sum only within the same currency. State whether the range includes a
partial day and that ingestion may lag. A successful zero-cost query, an empty
result and a failed query are distinct outcomes. Subscription renewal dates and
remaining promotional credit need separate authoritative billing evidence.

## Official references

- [CLI usage and Instance Principal](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliusing.htm)
- [Core service IAM permissions](https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/corepolicyreference.htm)
- [Monitoring IAM permissions](https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/monitoringpolicyreference.htm)
- [Cost Analysis and Usage API](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/costanalysisoverview.htm)
