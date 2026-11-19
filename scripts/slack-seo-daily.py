import json
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path('/home/ubuntu/rein-agent')
PST = timezone(timedelta(hours=-8))

def rows(source, name):
    return source.get('datasets', {}).get(name, {}).get('rows', [])

def latest(items):
    return max(items, key=lambda row: row.get('date') or '', default=None)

def value(num, pattern=',.0f'):
    return format(num, pattern) if isinstance(num, (int, float)) else '暂无'

def metrics(row):
    ctr = row.get('ctr')
    return (f"展示 {value(row.get('impressions'))} · 点击 {value(row.get('clicks'))} · "
            f"CTR {format(ctr, '.1%') if isinstance(ctr, (int, float)) else '暂无'}")

def label(source):
    return {'healthy':'正常','no_data':'暂无表现数据','partial':'数据不完整','error':'采集失败'}.get(source.get('status'), '状态未知')

def report():
    started = datetime.now(timezone.utc)
    result = subprocess.run([ROOT / '.toolchain/node_modules/node/bin/node',
        ROOT / 'workspace/skills/nori-seo/scripts/collect.mjs', '--config', ROOT / 'runtime/seo/config.json'],
        cwd=ROOT, capture_output=True, timeout=690)
    health = json.loads(result.stdout)
    data = json.loads((ROOT / 'runtime/seo/reports/latest.json').read_text())
    stamp = datetime.fromisoformat(data['fetchedAt'].replace('Z','+00:00'))
    if result.returncode not in (0, 2) or health.get('fetchedAt') != data['fetchedAt'] or stamp < started - timedelta(seconds=1):
        raise ValueError('snapshot')
    google, bing = (data['sources'][key] for key in ('google', 'bing'))
    period = google.get('requestedWindow', {}).get('current') or {}
    day = latest(rows(google, 'current_date'))
    totals = rows(google, 'current_total')
    lines = [f"*Rein SEO 日报* | {stamp.astimezone(PST):%Y-%m-%d %H:%M} PST",
             f"*Google Search Console* · {label(google)}"]
    if day:
        lines.append(f"最近有记录的日期 {day['date']}：{metrics(day)} · 平均排名 {value(day.get('position'), '.1f')}")
    if period:
        lines.append(f"28 天最终数据（{period['startDate']} 至 {period['endDate']}）："
                     + (metrics(totals[0]) + ' · 平均排名 ' + value(totals[0].get('position'), '.1f') if totals else '暂无可用汇总'))
    lines.append(f"*Bing Webmaster Tools* · {label(bing)}")
    traffic = latest(rows(bing, 'GetRankAndTrafficStats'))
    crawl = latest(rows(bing, 'GetCrawlStats'))
    lines.append(f"最近流量记录 {traffic['date'][:10]}：{metrics(traffic)}" if traffic else '暂无可用流量记录')
    if crawl:
        lines.append(f"抓取统计 {crawl['date'][:10]}：已抓取 {value(crawl.get('CrawledPages'))} 页 · 索引内 {value(crawl.get('InIndex'))} 页")
    elif feeds := rows(bing, 'GetFeeds'):
        when = (feeds[0].get('lastCrawled') or '')[:10]
        if when:
            lines.append(f"Sitemap 最近抓取：{when} UTC")
    return '\n'.join(lines), result.returncode

try:
    message, code = report()
except Exception:
    message, code = 'Rein SEO 日报 · 本次未取得可验证的新快照，Google 和 Bing 最新指标暂不可用。', 1
print(message)
raise SystemExit(code)
