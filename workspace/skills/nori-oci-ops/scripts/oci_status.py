#!/usr/bin/env python3
"""Read-only OCI/Nori snapshot. Python standard library; no stored credentials."""

import argparse
import datetime as dt
from decimal import Decimal
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.request


UTC = dt.timezone.utc
SECTIONS = ("host", "instance", "volumes", "backups", "monitoring", "cost")


class QueryError(Exception):
    pass


def timestamp(value):
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


def date_range(args):
    today = dt.datetime.now(UTC).date()
    if bool(args.start) != bool(args.end):
        raise ValueError("--start and --end must be used together")
    if args.start:
        if args.days is not None:
            raise ValueError("use either --days or --start/--end")
        start, end = dt.date.fromisoformat(args.start), dt.date.fromisoformat(args.end)
    else:
        days = args.days if args.days is not None else 7
        start, end = today - dt.timedelta(days=days), today
    if not 1 <= (end - start).days <= 90 or end > today:
        raise ValueError("range must cover 1–90 complete UTC days, ending no later than today")
    return start.isoformat() + "T00:00:00Z", end.isoformat() + "T00:00:00Z"


def metadata():
    request = urllib.request.Request(
        "http://169.254.169.254/opc/v2/instance/",
        headers={"Authorization": "Bearer Oracle"},
    )
    # IMDS must never pass through an environment-configured HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=5) as response:
            raw = json.load(response)
        keys = ("id", "compartmentId", "tenantId", "availabilityDomain", "region")
        scope = {key: raw[key] for key in keys}
        if not all(isinstance(value, str) and value for value in scope.values()):
            raise ValueError()
        return scope
    except Exception:
        raise QueryError("IMDSv2 unavailable or missing scope; run on the authorized OCI host") from None


class OCI:
    def __init__(self, scope):
        self.scope = scope
        self.executable = shutil.which("oci")
        if not self.executable:
            raise QueryError("oci executable not found on PATH")

    def call(self, *arguments):
        command = [self.executable, *arguments, "--auth", "instance_principal",
                   "--region", self.scope["region"], "--output", "json",
                   "--max-retries", "0", "--connection-timeout", "10", "--read-timeout", "20"]
        try:
            result = subprocess.run(command, text=True, capture_output=True, timeout=90)
        except subprocess.TimeoutExpired:
            raise QueryError("OCI command exceeded 90 seconds") from None
        except OSError:
            raise QueryError("OCI executable could not run") from None
        if result.returncode:
            # Keep safe diagnostic codes, never raw stderr, debug output or credentials.
            code = re.search(r'"code"\s*:\s*"([A-Za-z0-9_]+)"', result.stderr)
            status = re.search(r'"status"\s*:\s*(\d{3})', result.stderr)
            detail = ", ".join(filter(None, [code.group(1) if code else None,
                                            status.group(1) if status else None]))
            raise QueryError(f"OCI command failed (exit {result.returncode}{': ' + detail if detail else ''})")
        if not result.stdout.strip():
            return {"data": []}  # OCI list commands may emit nothing for an empty list.
        try:
            value = json.loads(result.stdout, parse_float=Decimal)
            if not isinstance(value, dict) or "data" not in value:
                raise ValueError()
            return value
        except ValueError:
            raise QueryError("OCI returned an unexpected JSON response") from None

    def listing(self, *arguments):
        data = self.call(*arguments, "--compartment-id", self.scope["compartmentId"], "--all")["data"]
        if not isinstance(data, list):
            raise QueryError("OCI list response was not a list")
        return data


def project(row, fields):
    return {target: row.get(source) for target, source in fields.items()}


def host_status():
    memory = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            name, value = line.split(":", 1)
            if name in ("MemTotal", "MemAvailable"):
                memory[name + "_GiB"] = round(int(value.strip().split()[0]) / 1024**2, 3)
        uptime = float(Path("/proc/uptime").read_text().split()[0])
    except (OSError, ValueError):
        raise QueryError("Linux /proc memory and uptime data unavailable") from None
    disk = shutil.disk_usage("/")
    services = {}
    for service in ("nori-router", "nori-web", "nori-slack", "nori-discord"):
        try:
            result = subprocess.run(["systemctl", "is-active", service], text=True,
                                    capture_output=True, timeout=5)
            state = result.stdout.strip()
            services[service] = state if state in ("active", "inactive", "failed", "activating",
                                                    "deactivating", "reloading") else "unknown"
        except (OSError, subprocess.TimeoutExpired):
            services[service] = "unknown"
    return {"logical_cpus": os.cpu_count(), "memory": memory, "uptime_seconds": uptime,
            "root_filesystem_GiB": dict(zip(("total", "used", "free"),
                                            (round(x / 1024**3, 3) for x in disk))),
            "services": services}


def instance_status(oci):
    data = oci.call("compute", "instance", "get", "--instance-id", oci.scope["id"])["data"]
    result = project(data, {"state": "lifecycle-state", "shape": "shape"})
    result["configuration"] = project(data.get("shape-config") or {}, {
        "ocpus": "ocpus", "memory_GB": "memory-in-gbs", "network_Gbps": "networking-bandwidth-in-gbps"})
    return result


def volumes_status(oci):
    fields = {"name": "display-name", "state": "lifecycle-state", "size_GiB": "size-in-gbs",
              "vpus_per_GB": "vpus-per-gb"}
    boot = oci.listing("bv", "boot-volume", "list", "--availability-domain", oci.scope["availabilityDomain"])
    block = oci.listing("bv", "volume", "list")
    return {"scope": "compartment resources; attachment not implied; boot volumes limited to current AD",
            "boot": [project(x, fields) for x in boot], "block": [project(x, fields) for x in block]}


def backups_status(oci):
    fields = {"name": "display-name", "state": "lifecycle-state", "type": "type",
              "created_utc": "time-created", "source_size_GiB": "size-in-gbs",
              "stored_unique_GiB": "unique-size-in-gbs", "expires_utc": "expiration-time"}
    return {kind: [project(x, fields) for x in oci.listing("bv", command, "list")]
            for kind, command in (("boot", "boot-volume-backup"), ("block", "backup"))}


def monitoring_status(oci):
    end = dt.datetime.now(UTC)
    start = end - dt.timedelta(minutes=30)
    metrics = oci.listing("monitoring", "metric", "list", "--namespace", "oci_computeagent")
    data = oci.call("monitoring", "metric-data", "summarize-metrics-data",
                    "--compartment-id", oci.scope["compartmentId"], "--namespace", "oci_computeagent",
                    "--query-text", f'CpuUtilization[1m]{{resourceId="{oci.scope["id"]}"}}.mean()',
                    "--start-time", timestamp(start), "--end-time", timestamp(end))["data"]
    points = [p for series in data for p in series.get("aggregated-datapoints", [])]
    latest = max(points, key=lambda p: p["timestamp"]) if points else None
    alarms = oci.listing("monitoring", "alarm", "list")
    return {"compartment_metric_names": sorted({x["name"] for x in metrics}),
            "cpu_percent": {"start_utc": timestamp(start), "end_utc": timestamp(end),
                            "interval": "1m mean", "point_count": len(points), "latest": latest},
            "compartment_alarms": [project(x, {"name": "display-name", "enabled": "is-enabled",
                                               "severity": "severity"}) for x in alarms]}


def cost_status(oci, start, end):
    rows, seen, page, pages = [], set(), None, 0
    while True:
        args = ["usage-api", "usage-summary", "request-summarized-usages",
                "--tenant-id", oci.scope["tenantId"], "--time-usage-started", start,
                "--time-usage-ended", end, "--granularity", "DAILY", "--query-type", "COST",
                "--group-by", '["service"]']
        if page:
            args += ["--page", page]
        response = oci.call(*args)
        items = response["data"]["items"]
        if not isinstance(items, list):
            raise QueryError("Cost response items was not a list")
        rows.extend(items)
        pages += 1
        page = response.get("opc-next-page")
        if not page:
            break
        if page in seen or pages >= 100:
            raise QueryError("Cost pagination incomplete; no complete total available")
        seen.add(page)
    totals, by_service, missing = {}, {}, 0
    for row in rows:
        amount, currency = row.get("computed-amount"), row.get("currency")
        if amount is None or not currency:
            missing += 1
            continue
        amount = Decimal(str(amount))
        if not amount.is_finite():
            raise QueryError("Cost response contains non-finite amount")
        totals[currency] = totals.get(currency, Decimal(0)) + amount
        key = (currency, row.get("service") or "unspecified")
        by_service[key] = by_service.get(key, Decimal(0)) + amount
    return {"scope": "tenancy", "start_inclusive_utc": start, "end_exclusive_utc": end,
            "granularity": "DAILY", "pages": pages, "rows": len(rows),
            "rows_without_amount_or_currency": missing, "totals_complete_for_returned_rows": missing == 0,
            "reported_amount_by_currency": {k: str(v) for k, v in sorted(totals.items())},
            "reported_amount_by_service": [{"currency": k[0], "service": k[1], "amount": str(v)}
                                           for k, v in sorted(by_service.items())],
            "caveat": "Reported usage cost may lag; not remaining credit or final invoice. Empty totals mean no priced rows."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--section", choices=("all", *SECTIONS), default="all")
    parser.add_argument("--days", type=int)
    parser.add_argument("--start")
    parser.add_argument("--end")
    args = parser.parse_args()
    try:
        start, end = date_range(args)
    except (ValueError, OverflowError) as error:
        parser.error(str(error))
    selected = SECTIONS if args.section == "all" else (args.section,)
    output = {"observed_at_utc": timestamp(dt.datetime.now(UTC)), "sections": {}}
    oci, cloud_error = None, None
    if any(x != "host" for x in selected):
        try:
            oci = OCI(metadata())
            output["scope"] = {"region": oci.scope["region"], "availability_domain": oci.scope["availabilityDomain"],
                               "resources": "current instance compartment; costs are tenancy-wide"}
        except QueryError as error:
            cloud_error = str(error)
    for section in selected:
        try:
            if section != "host" and cloud_error:
                raise QueryError(cloud_error)
            if section == "host":
                value = host_status()
            elif section == "cost":
                value = cost_status(oci, start, end)
            else:
                value = globals()[section + "_status"](oci)
            output["sections"][section] = {"ok": True, "data": value}
        except QueryError as error:
            output["sections"][section] = {"ok": False, "error": str(error)}
        except (KeyError, TypeError, ValueError):
            output["sections"][section] = {"ok": False, "error": "Unexpected response structure; no conclusion available"}
    print(json.dumps(output, indent=2, ensure_ascii=False, default=str))
    return 0 if all(x["ok"] for x in output["sections"].values()) else 1


if __name__ == "__main__":
    sys.exit(main())
