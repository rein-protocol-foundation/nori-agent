"""Synthetic fixtures only. Run: python3 tests/ai-news.test.py"""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "workspace/skills/ai-news/scripts/news.py"
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("ai_news", MODULE)
news = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(news)

SOURCE = {"id": "fixture", "name": "Fixture News", "kind": "official", "url": "https://example.org/feed"}
NOW = news.parse_date("2026-11-16T09:00:00-08:00")


def feed(date="Sun, 15 Nov 2026 19:00:00 GMT", url="https://example.org/news", title="A model launch"):
    return (f'<rss version="2.0"><channel><item><title>{title}</title><link>{url}</link>'
            f'<pubDate>{date}</pubDate><description>&lt;p&gt;A useful model&lt;/p&gt;</description>'
            '</item></channel></rss>').encode()


def snapshot(count=1, edition="daily"):
    window = news.edition_window(edition, NOW, "America/Los_Angeles")
    items = []
    for index in range(count):
        item = news.parse_feed(feed(url=f"https://example.org/news/{index}"), SOURCE)[0][0]
        items.append(item)
    return {"schemaVersion": 1, **window, "collectedAt": news.iso(NOW),
            "sources": [{"id": "fixture", "ok": True, "entries": count, "rejected": 0}], "candidates": items}


def legacy_draft(value):
    return {"items": [{"id": item["id"], "title": "研究团队发布新的语言模型",
                       "summary": "研究团队公布了一项新模型，并提供公开技术说明供开发者核查。",
                       "comment": "我会先在公开样例上检查长文本表现，再判断是否值得用于公益项目的材料整理。"}
                      for item in value["candidates"]]}


def draft(value):
    original = legacy_draft(value)
    return {"schemaVersion": 2, "items": [{"id": item["id"],
        "zh": {key: item[key] for key in ("title", "summary", "comment")},
        "en": {"title": "Researchers publish a new language model",
               "summary": "The team published a model with public technical notes that developers can inspect.",
               "comment": "I would test the public examples on long documents before using this model to organize nonprofit project materials."}}
        for item in original["items"]]}


def completed_legacy(directory, value):
    cfg = config(directory)
    binding = news._legacy_binding(cfg, value, legacy_draft(value))
    chunks = {platform + ":" + str(index): {"status": "sent", "receipt": {
        "messageId": f"fixture-legacy-{platform}-{index}", "channel": platform,
        "target": cfg["targets"][platform]}}
        for platform in ("slack", "discord") for index in range(len(binding["messages"][platform]))}
    ledger = {"fingerprint": news._fingerprint(binding), "binding": binding, "chunks": chunks}
    path = Path(directory) / "delivery" / (value["editionId"] + ".json")
    news.write_json(path, ledger)
    return path, ledger


def config(directory):
    return {"stateDirectory": str(directory), "nodeExecutable": "/usr/bin/node",
            "launchers": {"slack": "/fixture/slack.mjs", "discord": "/fixture/discord.mjs"},
            "targets": {"slack": "channel:C123456789", "discord": "channel:123456789012345678"}}


def sender(calls):
    def run(command, **kwargs):
        calls.append(command)
        platform = command[command.index("--channel") + 1]
        target = command[command.index("--target") + 1]
        receipt = {"action": "send", "channel": platform, "dryRun": False,
                   "messageId": f"fixture-{len(calls)}", "payload": {"result": {"channelId": target.removeprefix("channel:")}}}
        return subprocess.CompletedProcess(command, 0, "plugin boot log\n" + json.dumps(receipt, indent=2), "")
    return run


class FeedTests(unittest.TestCase):
    def test_rss_html_and_tracking_url(self):
        items, rejected = news.parse_feed(feed(url="https://example.org/news?utm_source=x&amp;a=1#top"), SOURCE)
        self.assertEqual(rejected, 0)
        self.assertEqual(items[0]["excerpt"], "A useful model")
        self.assertEqual(items[0]["url"], "https://example.org/news?a=1")
        self.assertEqual(items[0]["publishedAt"], "2026-11-15T19:00:00Z")

    def test_atom_requires_published_not_updated(self):
        body = b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Model</title>
        <link rel="self" href="https://example.org/self"/><link href="https://example.org/article"/>
        <published>2026-11-15T10:00:00-08:00</published><updated>2026-11-16T00:00:00Z</updated>
        <summary type="html">&lt;b&gt;New&lt;/b&gt; results</summary></entry></feed>'''
        items, rejected = news.parse_feed(body, SOURCE)
        self.assertEqual(items[0]["url"], "https://example.org/article")
        self.assertEqual(items[0]["excerpt"], "New results")
        self.assertEqual(rejected, 0)
        items, rejected = news.parse_feed(body.replace(b"<published>", b"<unused>").replace(b"</published>", b"</unused>"), SOURCE)
        self.assertEqual((items, rejected), ([], 1))

    def test_bad_dates_are_rejected(self):
        for date in ("", "tomorrow", "2026-11-15", "2026-11-15T10:00:00", "31 Nov 2026 00:00:00 GMT"):
            with self.subTest(date=date):
                self.assertEqual(news.parse_feed(feed(date=date), SOURCE), ([], 1))

    def test_narrow_entity_repair_and_xml_rejection(self):
        items, _ = news.parse_feed(feed(title="Models & research&nbsp;today"), SOURCE)
        self.assertEqual(items[0]["title"], "Models & research today")
        with self.assertRaises(news.NewsError):
            news.parse_feed(b'<html><body>blocked</body></html>', SOURCE)
        with self.assertRaises(news.NewsError):
            news.parse_feed(b'<!DOCTYPE x [<!ENTITY x "bad">]><rss/>', SOURCE)
        with self.assertRaises(news.NewsError):
            news.parse_feed(b'<rss><broken></rss>', SOURCE)

    def test_public_url_boundary(self):
        for url in ("http://example.org/news", "https://127.0.0.1/news", "https://localhost/news",
                    "https://foo.local/news", "https://user:pass@example.org/", "https://example.org:444/",
                    "https://example.org/a\n@everyone", "https://[::1]/"):
            with self.subTest(url=url), self.assertRaises(news.NewsError):
                news.public_url(url)
        self.assertEqual(news.public_url("https://EXAMPLE.org/a?q=x&utm_source=test#hi"), "https://example.org/a?q=x")

    def test_fetch_rejects_private_dns_before_connecting(self):
        with patch.object(news.socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("10.0.0.1", 443))]), \
                patch.object(news.socket, "create_connection") as connection:
            with self.assertRaises(news.NewsError):
                news.fetch_public("https://example.org/feed")
            connection.assert_not_called()


class WindowTests(unittest.TestCase):
    def test_daily_is_24_hours_across_dst(self):
        for moment in ("2026-03-08T09:00:00-07:00", "2026-11-01T09:00:00-08:00"):
            window = news.edition_window("daily", news.parse_date(moment), "America/Los_Angeles")
            self.assertEqual(news.parse_date(window["end"]) - news.parse_date(window["start"]), timedelta(hours=24))

    def test_weekly_previous_calendar_week_dst(self):
        for moment, hours in (("2026-03-09T09:00:00-07:00", 167), ("2026-11-02T09:00:00-08:00", 169)):
            window = news.edition_window("weekly", news.parse_date(moment), "America/Los_Angeles")
            start, end = news.parse_date(window["start"]), news.parse_date(window["end"])
            self.assertEqual((end - start).total_seconds() / 3600, hours)
            self.assertEqual(start.astimezone(news.ZoneInfo("America/Los_Angeles")).weekday(), 0)
            self.assertEqual(end.astimezone(news.ZoneInfo("America/Los_Angeles")).hour, 0)
        window = news.edition_window("weekly", NOW, "America/Los_Angeles")
        self.assertEqual(window["start"], "2026-11-09T08:00:00Z")
        self.assertEqual(window["end"], "2026-11-16T08:00:00Z")


class CollectionTests(unittest.TestCase):
    def test_boundaries_and_duplicate_urls(self):
        source2 = {**SOURCE, "id": "fixture2", "url": "https://other.example.org/feed"}
        start = news.edition_window("daily", NOW, "America/Los_Angeles")["start"]
        def fetch(url):
            return feed(date=start, url="https://example.org/news?utm_source=" + ("one" if url == SOURCE["url"] else "two"))
        with tempfile.TemporaryDirectory() as directory:
            _, value = news.collect(directory, now=NOW, sources=[SOURCE, source2], fetcher=fetch)
            self.assertEqual(len(value["candidates"]), 1)
            _, value = news.collect(directory, now=NOW, sources=[SOURCE], fetcher=lambda _: feed(date=news.iso(NOW), url="https://example.org/end"))
            self.assertEqual(len(value["candidates"]), 1)
            self.assertNotEqual(value["candidates"][0]["url"], "https://example.org/end")

    def test_partial_failure_and_weekly_archive(self):
        bad = {**SOURCE, "id": "bad", "url": "https://bad.example.org/feed"}
        def fetch(url):
            if url == bad["url"]:
                raise TimeoutError("fixture")
            return feed()
        with tempfile.TemporaryDirectory() as directory:
            _, value = news.collect(directory, now=NOW, sources=[SOURCE, bad], fetcher=fetch)
            text = news.render(value, draft(value))["slack"][0]
            self.assertIn("1/2", text)
            self.assertIn("来源：1/2 可用", text)
            _, weekly = news.collect(directory, edition="weekly", now=NOW, sources=[SOURCE],
                                     fetcher=lambda _: b"<rss><channel/></rss>")
            self.assertEqual(len(weekly["candidates"]), 1)

    def test_all_failed_or_undated_abort_but_legitimate_empty_works(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(news.NewsError):
                news.collect(directory, now=NOW, sources=[SOURCE], fetcher=lambda _: b"<html/>")
            with self.assertRaises(news.NewsError):
                news.collect(directory, now=NOW, sources=[SOURCE], fetcher=lambda _: feed(date=""))
            _, value = news.collect(directory, now=NOW, sources=[SOURCE], fetcher=lambda _: b"<rss><channel/></rss>")
            self.assertIn("没有符合时间范围", news.render(value, {"schemaVersion": 2, "items": []})["slack"][0])

    def test_future_dates_and_changed_date_do_not_recycle(self):
        with tempfile.TemporaryDirectory() as directory:
            news.collect(directory, now=NOW, sources=[SOURCE], fetcher=lambda _: feed(date="2026-11-01T10:00:00Z"))
            _, value = news.collect(directory, now=NOW, sources=[SOURCE], fetcher=lambda _: feed())
            self.assertEqual(value["candidates"], [])
            _, value = news.collect(directory, now=NOW, sources=[SOURCE],
                                    fetcher=lambda _: feed(date="2099-11-01T10:00:00Z", url="https://example.org/future"))
            self.assertEqual(value["candidates"], [])


class EditorialTests(unittest.TestCase):
    def test_render_native_and_plain_fallback_without_markup(self):
        value = snapshot(10)
        result = news.render(value, draft(value))
        self.assertEqual(result["slack"], result["discord"])
        self.assertLessEqual(len(result["slack"]), 20)
        self.assertEqual(sum(t.count("Nori 点评：") for t in result["slack"]), 10)
        for text, card in zip(result["discord"], result["presentations"]):
            self.assertLess(news.utf16_length(text), 1800)
            prose = "\n".join(line for line in text.splitlines()
                              if not line.startswith(("https://", "时区：")))
            self.assertNotRegex(prose, r"[<>`*_]")
            self.assertLessEqual(sum(b["type"] == "buttons" for b in card["blocks"]), 3)
            for block in card["blocks"]:
                if block["type"] == "buttons":
                    self.assertEqual(block["buttons"][0]["action"]["type"], "url")

    def test_reader_dates_are_local_concise_and_snapshot_keeps_precision(self):
        value = snapshot(10, edition="weekly")
        before = json.dumps(value, sort_keys=True)
        result = news.render(value, draft(value))
        text = "\n".join(result["slack"])
        self.assertIn("Nori AI 周报 · 中文", text)
        self.assertIn("Nori AI Weekly · English", text)
        self.assertIn("11 月 16 日 9:00 PST", text)
        self.assertIn("Nov 16, 9:00 AM PST", text)
        self.assertIn("Fixture News · 11 月 15 日 11:00 PST", text)
        self.assertNotIn("America/Los_Angeles", text)
        self.assertNotIn("结束时刻", text)
        self.assertNotRegex(text, r"第\s*\d+.*页|(?i:part|page)\s+\d+|\d{4}-\d\d-\d\dT|\d\d:\d\d:\d\d")
        self.assertEqual(before, json.dumps(value, sort_keys=True))
        for card in result["presentations"]:
            self.assertNotIn("页", card["title"])
            self.assertEqual(sum("Nori AI" in b.get("text", "") for b in card["blocks"]), 0)

    def test_weekly_coverage_range_stays_short(self):
        value = snapshot(0)
        value.update(news.edition_window("weekly", news.parse_date("2027-01-04T09:00:00-08:00"), "America/Los_Angeles"))
        value["collectedAt"] = "2027-01-04T17:00:00Z"
        text = "\n".join(news.render(value, {"schemaVersion": 2, "items": []})["slack"])
        self.assertIn("本期：12 月 28 日–1 月 3 日", text)
        self.assertIn("Week: Dec 28–Jan 3", text)
        self.assertIn("Jan 4, 9:00 AM PST", text)

    def test_formatting_injection_rejected(self):
        value = snapshot()
        for text in ("**粗体新闻**", "<b>中文标题</b>", "中文 @everyone", "中文 <@123>",
                     "中文\n标题", "[中文链接](https://example.org)", "中文\u202e文字", "值得注意的是新模型发布"):
            with self.subTest(text=text):
                data = draft(value)
                data["items"][0]["zh"]["title"] = text
                with self.assertRaises(news.NewsError):
                    news.render(value, data)

    def test_cap_unknown_duplicate_and_extra_fields(self):
        with self.assertRaises(news.NewsError):
            news.render(snapshot(11), draft(snapshot(11)))
        value = snapshot()
        for mutation in (lambda d: d["items"].append(d["items"][0].copy()),
                         lambda d: d["items"][0].update(id="invented"),
                         lambda d: d["items"][0].update(url="https://example.org/invented")):
            data = draft(value)
            mutation(data)
            with self.assertRaises(news.NewsError):
                news.render(value, data)

    def test_emoji_utf16_limit_and_reject_oversized_single_item(self):
        self.assertEqual(news.utf16_length("中文😀"), 4)
        value = snapshot(10)
        data = draft(value)
        for item in data["items"]:
            item["zh"]["summary"] = "中" + "😀" * 279
            item["zh"]["comment"] = "文" + "😀" * 179
        result = news.render(value, data)
        self.assertTrue(all(news.utf16_length(t) < 1800 for t in result["discord"]))
        value = snapshot()
        value["candidates"][0]["url"] = "https://example.org/" + "x" * 1750
        value["candidates"][0]["id"] = news.hashlib.sha256(value["candidates"][0]["url"].encode()).hexdigest()[:24]
        with self.assertRaises(news.NewsError):
            news.render(value, draft(value))

    def test_immutable_snapshot_window_and_empty_claim(self):
        value = snapshot()
        with self.assertRaises(news.NewsError):
            news.render(value, {"schemaVersion": 2, "items": []})
        value["editionId"] = "daily-2026-11-15"
        with self.assertRaises(news.NewsError):
            news.render(value, draft(value))


class DeliveryTests(unittest.TestCase):
    def test_no_send_without_flag_then_restart_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            value, calls = snapshot(), []
            cfg = config(directory)
            self.assertEqual(news.publish(cfg, value, draft(value), runner=sender(calls))["status"], "preview")
            self.assertEqual(calls, [])
            first = news.publish(cfg, value, draft(value), send=True, runner=sender(calls))
            self.assertEqual(first["status"], "sent")
            self.assertEqual(len(calls), 4)
            self.assertIn("--presentation", calls[0])
            self.assertTrue(all("--message" not in call for call in calls))
            self.assertEqual(news.publish(cfg, value, draft(value), send=True, runner=sender(calls))["status"], "sent")
            self.assertEqual(len(calls), 4)
            changed = draft(value)
            changed["items"][0]["zh"]["comment"] += "还需要进一步检查。"
            with self.assertRaises(news.NewsError):
                news.publish(cfg, value, changed, send=True, runner=sender(calls))

    def test_durable_intent_before_send_timeout_blocks_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            value, calls = snapshot(), []
            cfg = config(directory)
            def runner(command, **kwargs):
                ledger = news.read_json(Path(directory) / "delivery" / (value["editionId"] + ".json"))
                platform = command[command.index("--channel") + 1]
                self.assertEqual(ledger["chunks"][platform + (":zh:0" if "中文" in command[command.index("--presentation") + 1] else ":en:0")]["status"], "intent")
                if platform == "slack":
                    calls.append(command)
                    raise subprocess.TimeoutExpired(command, 90)
                return sender(calls)(command, **kwargs)
            result = news.publish(cfg, value, draft(value), send=True, runner=runner)
            self.assertEqual(result["status"], "incomplete")
            self.assertEqual(result["platforms"]["discord"], "sent")
            self.assertEqual(len(calls), 3)
            news.publish(cfg, value, draft(value), send=True, runner=runner)
            self.assertEqual(len(calls), 3)

    def test_process_interruption_keeps_intent_and_suppresses_resend(self):
        with tempfile.TemporaryDirectory() as directory:
            value, calls = snapshot(), []
            def interrupt(*args, **kwargs):
                raise KeyboardInterrupt()
            with self.assertRaises(KeyboardInterrupt):
                news.publish(config(directory), value, draft(value), send=True, runner=interrupt)
            result = news.publish(config(directory), value, draft(value), send=True, runner=sender(calls))
            self.assertEqual(result["status"], "incomplete")
            self.assertEqual(len(calls), 2)
            self.assertEqual(calls[0][calls[0].index("--channel") + 1], "discord")

    def test_partial_chunk_failure_preserves_earlier_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            value, calls, slack_count = snapshot(10), [], 0
            def runner(command, **kwargs):
                nonlocal slack_count
                if command[command.index("--channel") + 1] == "slack":
                    slack_count += 1
                    if slack_count == 2:
                        calls.append(command)
                        return subprocess.CompletedProcess(command, 0, "unparseable receipt", "")
                return sender(calls)(command, **kwargs)
            result = news.publish(config(directory), value, draft(value), send=True, runner=runner)
            self.assertEqual(result["status"], "incomplete")
            ledger = news.read_json(result["ledger"])
            self.assertEqual(ledger["chunks"]["slack:zh:0"]["status"], "sent")
            self.assertEqual(ledger["chunks"]["slack:zh:1"]["status"], "uncertain")
            self.assertEqual(result["platforms"]["discord"], "sent")
            previous = len(calls)
            news.publish(config(directory), value, draft(value), send=True, runner=runner)
            self.assertEqual(len(calls), previous)

    def test_receipt_rejects_dry_run_partial_and_wrong_target(self):
        receipt = {"action": "send", "channel": "slack", "dryRun": False,
                   "messageId": "fixture-message", "payload": {"to": "channel:C123456789"}}
        self.assertEqual(news.verified_receipt(json.dumps(receipt), "slack", "channel:C123456789")["messageId"], "fixture-message")
        for mutation in ({"dryRun": True}, {"ok": False}, {"sentBeforeError": True},
                         {"messageId": ""}, {"channel": "discord"}, {"payload": {"to": "wrong"}},
                         {"payload": {"to": "channel:C123456789", "ok": False}},
                         {"payload": {"to": "channel:C123456789", "deliveryStatus": "failed"}},
                         {"payload": {"to": "channel:C123456789", "result": {"ok": False}}},
                         {"deliveryStatus": "partial_failed"}):
            with self.subTest(mutation=mutation), self.assertRaises(news.NewsError):
                news.verified_receipt(json.dumps({**receipt, **mutation}), "slack", "channel:C123456789")

    def test_lock_and_exact_target_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            with news.state_lock(directory):
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(news.collect, directory, now=NOW, sources=[SOURCE], fetcher=lambda _: feed())
                    with self.assertRaises(news.NewsError):
                        future.result()
            cfg = config(directory)
            cfg["targets"]["slack"] = "general"
            with self.assertRaises(news.NewsError):
                news.publish(cfg, snapshot(), draft(snapshot()))

    def test_preview_files_are_real_channel_payloads(self):
        with tempfile.TemporaryDirectory() as directory:
            value = snapshot()
            news.preview(value, draft(value), directory)
            for platform in ("slack", "discord"):
                result = news.read_json(Path(directory) / (platform + ".json"))
                self.assertIn("message", result["messages"][0])
                self.assertIn("presentation", result["messages"][0])


class BilingualTests(unittest.TestCase):
    def test_same_events_order_links_and_full_chinese_before_english(self):
        value = snapshot(4)
        data = draft(value)
        data["items"] = [data["items"][i] for i in (3, 1, 0)]
        result = news.render(value, data)
        expected = [item["id"] for item in data["items"]]
        languages = result["languages"]
        self.assertEqual(languages, sorted(languages, key=lambda lang: lang == "en"))
        self.assertEqual(result["slack"], result["discord"])
        for language in ("zh", "en"):
            indexes = [i for i, lang in enumerate(languages) if lang == language]
            self.assertEqual([identifier for i in indexes for identifier in result["itemIds"][i]], expected)
            body = "\n".join(result["slack"][i] for i in indexes)
            for identifier in expected:
                url = next(item["url"] for item in value["candidates"] if item["id"] == identifier)
                self.assertEqual(body.count(url), 1)
            for i in indexes:
                self.assertLess(news.utf16_length(result["slack"][i]), 1800)
                self.assertLess(news.utf16_length(news._native_fallback(result["presentations"][i])), 1800)
                self.assertLessEqual(len(result["itemIds"][i]), 3)
        self.assertEqual(sum(t.count("Nori 点评：") for t in result["slack"]), 3)
        self.assertEqual(sum(t.count("Nori's take:") for t in result["slack"]), 3)

    def test_english_validation_and_both_versions_precede_any_send(self):
        value = snapshot()
        for title in ("A **new** model", "A model @everyone", "<b>A new model</b>",
                      "A model\nlaunch", "A model https://example.org/", "As an AI I see a model", "新的语言模型发布", "Part 1/2: The model"):
            data = draft(value)
            data["items"][0]["en"]["title"] = title
            with tempfile.TemporaryDirectory() as directory:
                calls = []
                with self.subTest(title=title), self.assertRaises(news.NewsError):
                    news.publish(config(directory), value, data, send=True, runner=sender(calls))
                self.assertEqual(calls, [])
                self.assertFalse((Path(directory) / "delivery").exists())
        data = draft(value)
        del data["items"][0]["en"]
        with self.assertRaises(news.NewsError):
            news.render(value, data)
        with self.assertRaises(news.NewsError):
            news.render(value, legacy_draft(value))

    def test_natural_english_lengths_and_native_budget(self):
        value = snapshot(10)
        data = draft(value)
        for item in data["items"]:
            item["en"]["title"] = "Researchers publish a new model with public technical notes"
            item["en"]["summary"] = ("Developers can inspect the public examples and compare the documented limits. " * 7).strip()
            item["en"]["comment"] = ("I would check document accuracy before adopting this model. " * 6).strip()
        result = news.render(value, data)
        for card in result["presentations"]:
            self.assertLess(news.utf16_length(news._native_fallback(card)), 1800)
        data["items"][0]["en"]["summary"] = "x" * 601
        with self.assertRaises(news.NewsError):
            news.render(value, data)

    def test_timestamp_dst_uses_issuance_and_local_abbreviation(self):
        zone = news.ZoneInfo("America/Los_Angeles")
        for timestamp, zh, en in (
            ("2026-03-08T09:30:00Z", "3 月 8 日 1:30 PST", "Mar 8, 1:30 AM PST"),
            ("2026-03-08T10:30:00Z", "3 月 8 日 3:30 PDT", "Mar 8, 3:30 AM PDT"),
            ("2026-11-01T08:30:00Z", "11 月 1 日 1:30 PDT", "Nov 1, 1:30 AM PDT"),
            ("2026-11-01T09:30:00Z", "11 月 1 日 1:30 PST", "Nov 1, 1:30 AM PST")):
            instant = news.parse_date(timestamp)
            self.assertEqual(news.issue_time(instant, zone, "zh"), zh)
            self.assertEqual(news.issue_time(instant, zone, "en"), en)

    def test_english_uncertainty_blocks_resends_and_freezes_whole_edition(self):
        value = snapshot()
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            def runner(command, **kwargs):
                presentation = json.loads(command[command.index("--presentation") + 1])
                if command[command.index("--channel") + 1] == "slack" and "English" in presentation["title"]:
                    calls.append(command)
                    raise subprocess.TimeoutExpired(command, 90)
                return sender(calls)(command, **kwargs)
            result = news.publish(config(directory), value, draft(value), send=True, runner=runner)
            self.assertEqual(result["status"], "incomplete")
            ledger = news.read_json(result["ledger"])
            self.assertEqual(ledger["chunks"]["slack:zh:0"]["status"], "sent")
            self.assertEqual(ledger["chunks"]["slack:en:0"]["status"], "uncertain")
            self.assertEqual(len(calls), 4)
            news.publish(config(directory), value, draft(value), send=True, runner=runner)
            self.assertEqual(len(calls), 4)
            changed = draft(value)
            changed["items"][0]["en"]["comment"] += " I would also inspect source attribution."
            with self.assertRaises(news.NewsError):
                news.publish(config(directory), value, changed, send=True, runner=runner)
            self.assertEqual(len(calls), 4)


class LegacyCompatibilityTests(unittest.TestCase):
    def test_exact_legacy_fingerprints_are_frozen(self):
        for count, edition, fingerprint in (
            (1, "daily", "82108cbade3a1c8e66e6de6a84bb6ffbf1a1364293d3e62ab5c4a494f6c76662"),
            (10, "weekly", "164e2c1274e13e2b075685426ea93eba12c93be99709dec7ff0c6fa8c84d2f61")):
            value = snapshot(count, edition)
            binding = news._legacy_binding(config("/tmp/fixture"), value, legacy_draft(value))
            self.assertEqual(news._fingerprint(binding), fingerprint)
            self.assertEqual(news._legacy_binding(config("/tmp/fixture"), value, draft(value)), binding)

    def test_completed_legacy_is_verified_no_op_and_never_rewritten(self):
        value = snapshot()
        with tempfile.TemporaryDirectory() as directory:
            path, _ = completed_legacy(directory, value)
            before, calls = path.read_bytes(), []
            for data in (legacy_draft(value), draft(value)):
                result = news.publish(config(directory), value, data, send=True, runner=sender(calls))
                self.assertEqual(result["status"], "sent")
                self.assertTrue(result["legacy"])
            self.assertEqual(calls, [])
            self.assertEqual(path.read_bytes(), before)
            changed = draft(value)
            changed["items"][0]["zh"]["title"] += "新消息"
            with self.assertRaises(news.NewsError):
                news.publish(config(directory), value, changed, send=True, runner=sender(calls))
            cfg = config(directory)
            cfg["targets"]["slack"] = "channel:C999999999"
            with self.assertRaises(news.NewsError):
                news.publish(cfg, value, draft(value), send=True, runner=sender(calls))
            self.assertEqual(path.read_bytes(), before)

    def test_no_new_legacy_publications(self):
        value = snapshot()
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            with self.assertRaises(news.NewsError):
                news.publish(config(directory), value, legacy_draft(value), send=True, runner=sender(calls))
            self.assertEqual(calls, [])

    def test_english_supplement_separate_bound_ledger_and_idempotency(self):
        value = snapshot(4)
        with tempfile.TemporaryDirectory() as directory:
            path, original = completed_legacy(directory, value)
            before, calls = path.read_bytes(), []
            preview = news.publish_translation(config(directory), value, draft(value), runner=sender(calls))
            self.assertEqual(preview["languages"], ["en"] * len(preview["languages"]))
            self.assertEqual(calls, [])
            result = news.publish_translation(config(directory), value, draft(value), send=True, runner=sender(calls))
            self.assertEqual(result["status"], "sent")
            previous = len(calls)
            ledger = news.read_json(result["ledger"])
            self.assertEqual(ledger["binding"]["originalFingerprint"], original["fingerprint"])
            self.assertEqual(ledger["kind"], "legacy-english-supplement")
            self.assertTrue(all(":en:" in key for key in ledger["chunks"]))
            self.assertTrue(all("English" in json.loads(call[call.index("--presentation") + 1])["title"] for call in calls))
            news.publish_translation(config(directory), value, draft(value), send=True, runner=sender(calls))
            self.assertEqual(len(calls), previous)
            self.assertEqual(path.read_bytes(), before)
            changed = draft(value)
            changed["items"][0]["en"]["comment"] += " This also needs an attribution check."
            with self.assertRaises(news.NewsError):
                news.publish_translation(config(directory), value, changed, send=True, runner=sender(calls))
            self.assertEqual(len(calls), previous)

    def test_missing_partial_uncertain_or_changed_legacy_blocks_translation(self):
        value = snapshot()
        for mutation in (lambda ledger: ledger["chunks"].pop("slack:0"),
                         lambda ledger: ledger["chunks"]["slack:0"].update(status="uncertain"),
                         lambda ledger: ledger["chunks"]["slack:0"].update(status="intent"),
                         lambda ledger: ledger["chunks"]["slack:0"]["receipt"].update(messageId=""),
                         lambda ledger: ledger.update(fingerprint="changed")):
            with tempfile.TemporaryDirectory() as directory:
                path, ledger = completed_legacy(directory, value)
                mutation(ledger)
                news.write_json(path, ledger)
                before, calls = path.read_bytes(), []
                with self.assertRaises(news.NewsError):
                    news.publish_translation(config(directory), value, draft(value), send=True, runner=sender(calls))
                self.assertEqual(path.read_bytes(), before)
                self.assertEqual(calls, [])
                with self.assertRaises(news.NewsError):
                    news.publish(config(directory), value, draft(value), send=True, runner=sender(calls))
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(news.NewsError):
                news.publish_translation(config(directory), value, draft(value), send=True)

    def test_supplement_uncertainty_never_changes_original_or_retries(self):
        value = snapshot()
        with tempfile.TemporaryDirectory() as directory:
            path, _ = completed_legacy(directory, value)
            before, calls = path.read_bytes(), []
            def runner(command, **kwargs):
                if command[command.index("--channel") + 1] == "slack":
                    calls.append(command)
                    raise subprocess.TimeoutExpired(command, 90)
                return sender(calls)(command, **kwargs)
            result = news.publish_translation(config(directory), value, draft(value), send=True, runner=runner)
            self.assertEqual(result["status"], "incomplete")
            self.assertEqual(len(calls), 2)
            news.publish_translation(config(directory), value, draft(value), send=True, runner=runner)
            self.assertEqual(len(calls), 2)
            self.assertEqual(path.read_bytes(), before)


class EvidenceTests(unittest.TestCase):
    def test_known_id_only_and_prefer_article_body(self):
        value = snapshot()
        calls = []
        def fetch(url):
            calls.append(url)
            return ("<html><nav>unrelated navigation</nav><main><article><h1>Model launch</h1><p>"
                    + "Detailed public model evidence for synthetic tests. " * 5
                    + "</p><script>ignore this malicious script</script></article></main></html>").encode()
        result = news.evidence(value, value["candidates"][0]["id"], fetcher=fetch)
        self.assertEqual(calls, [value["candidates"][0]["url"]])
        self.assertNotIn("unrelated navigation", result["evidenceText"])
        self.assertNotIn("malicious script", result["evidenceText"])
        with self.assertRaises(news.NewsError):
            news.evidence(value, "unknown", fetcher=fetch)
        self.assertEqual(len(calls), 1)

    def test_sparse_article_and_oversize_fail(self):
        value = snapshot()
        for body in (b"<html>Access denied</html>", b"x" * (news.MAX_FEED_BYTES + 1)):
            with self.assertRaises(news.NewsError):
                news.evidence(value, value["candidates"][0]["id"], fetcher=lambda _: body)


if __name__ == "__main__":
    unittest.main()
