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


def draft(value):
    return {"items": [{"id": item["id"], "title": "研究团队发布新的语言模型",
                       "summary": "研究团队公布了一项新模型，并提供公开技术说明供开发者核查。",
                       "comment": "我会先在公开样例上检查长文本表现，再判断是否值得用于公益项目的材料整理。"}
                      for item in value["candidates"]]}


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
            self.assertIn("获取失败", text)
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
            self.assertIn("没有符合时间范围", news.render(value, {"items": []})["slack"][0])

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
        self.assertLessEqual(len(result["slack"]), 5)
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
        self.assertIn("Nori AI 周报 · 2026年", text)
        self.assertIn("11月9日 00:00 至 11月16日 00:00（洛杉矶时间，结束时刻不含）", text)
        self.assertIn("Fixture News · 11月15日 11:00", text)
        self.assertNotIn("America/Los_Angeles", text)
        self.assertNotRegex(text, r"\d{4}-\d\d-\d\dT|\d\d:\d\d:\d\d|[+-]\d\d:\d\d")
        self.assertEqual(before, json.dumps(value, sort_keys=True))
        for index, card in enumerate(result["presentations"], 1):
            self.assertTrue(card["title"].endswith(f"第 {index}/{len(result['presentations'])} 页"))
            self.assertEqual(sum("Nori AI 周报" in b.get("text", "") for b in card["blocks"]), 0)
        one = news.render(snapshot(), draft(snapshot()))
        self.assertNotIn("页", one["presentations"][0]["title"])

    def test_cross_year_window_names_both_years(self):
        value = snapshot(0)
        value.update(news.edition_window("weekly", news.parse_date("2027-01-04T09:00:00-08:00"), "America/Los_Angeles"))
        text = news.render(value, {"items": []})["slack"][0]
        self.assertIn("2026年12月28日 00:00 至 2027年1月4日 00:00", text)

    def test_formatting_injection_rejected(self):
        value = snapshot()
        for text in ("**粗体新闻**", "<b>中文标题</b>", "中文 @everyone", "中文 <@123>",
                     "中文\n标题", "[中文链接](https://example.org)", "中文\u202e文字", "值得注意的是新模型发布"):
            with self.subTest(text=text):
                data = draft(value)
                data["items"][0]["title"] = text
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
            item["summary"] = "中" + "😀" * 279
            item["comment"] = "文" + "😀" * 179
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
            news.render(value, {"items": []})
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
            self.assertEqual(len(calls), 2)
            self.assertIn("--presentation", calls[0])
            self.assertTrue(all("--message" not in call for call in calls))
            self.assertEqual(news.publish(cfg, value, draft(value), send=True, runner=sender(calls))["status"], "sent")
            self.assertEqual(len(calls), 2)
            changed = draft(value)
            changed["items"][0]["comment"] += "还需要进一步检查。"
            with self.assertRaises(news.NewsError):
                news.publish(cfg, value, changed, send=True, runner=sender(calls))

    def test_durable_intent_before_send_timeout_blocks_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            value, calls = snapshot(), []
            cfg = config(directory)
            def runner(command, **kwargs):
                ledger = news.read_json(Path(directory) / "delivery" / (value["editionId"] + ".json"))
                platform = command[command.index("--channel") + 1]
                self.assertEqual(ledger["chunks"][platform + ":0"]["status"], "intent")
                if platform == "slack":
                    calls.append(command)
                    raise subprocess.TimeoutExpired(command, 90)
                return sender(calls)(command, **kwargs)
            result = news.publish(cfg, value, draft(value), send=True, runner=runner)
            self.assertEqual(result["status"], "incomplete")
            self.assertEqual(result["platforms"]["discord"], "sent")
            self.assertEqual(len(calls), 2)
            news.publish(cfg, value, draft(value), send=True, runner=runner)
            self.assertEqual(len(calls), 2)

    def test_process_interruption_keeps_intent_and_suppresses_resend(self):
        with tempfile.TemporaryDirectory() as directory:
            value, calls = snapshot(), []
            def interrupt(*args, **kwargs):
                raise KeyboardInterrupt()
            with self.assertRaises(KeyboardInterrupt):
                news.publish(config(directory), value, draft(value), send=True, runner=interrupt)
            result = news.publish(config(directory), value, draft(value), send=True, runner=sender(calls))
            self.assertEqual(result["status"], "incomplete")
            self.assertEqual(len(calls), 1)
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
            self.assertEqual(ledger["chunks"]["slack:0"]["status"], "sent")
            self.assertEqual(ledger["chunks"]["slack:1"]["status"], "uncertain")
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
