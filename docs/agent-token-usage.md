# 跨 Agent 用量交接指南

在 Codex 之外的工具中接手本仓库任务时，手动读取根目录的 [AGENTS.md](../AGENTS.md)
和本指南。根目录的按需报告规则同样适用于非 Codex agent。根据当前工具提供的运行时元数据、
用量 API 或账单接口接入，Codex 的 `.codex/config.toml` 和 `.codex/agents/` 仅配置 Codex。
本指南约定交接格式，外部工具的执行取决于其实际配置与接口能力。

普通问答、讨论、解释和进度更新不自动查询或输出 usage。仅在开发任务完成、任务交接
（包括未完成或阻塞交接），或用户明确要求时统计。默认一行简报，完整表格不是必填项。

1. 开发任务开始可记录任务 ID 和起始轮次或调用标识，不专门调用工具采集基线。
   复用会话时，以本次任务边界筛选调用。
   若只能取得包含历史任务的会话总量，展示该实际数字并标注「会话累计，非本任务用量」；
   当前任务增量单独标为「不可用」并说明原因，不要把已知的会话总量也丢弃。
2. 各 agent 或子进程向父 agent 返回实际模型和推理强度、输入、缓存输入、输出和总量，
   以及数据来源、调用标识或覆盖区间和缺失字段。优先使用运行时实际记录的模型和推理强度。
   某项仅有配置值或缺少可归属到当前任务的记录时，填「不可用」。
3. 父 agent 按调用去重，并检查父会话的计数是否已包含子调用。核对供应商字段定义后，
   将缓存输入统一表示为输入的子集。若供应商按独立字段给出互斥的未缓存输入和缓存输入，
   则先合并为输入总量。已经包含在输出中的推理 token 只计一次。覆盖范围不明时，
   可以分别列出已核实的来源与范围，无法确认的合计填「不可用」。
4. 触发报告条件时，按根目录的一行模板提供输入、缓存输入（输入子集）、输出、总计、
   统计范围与 usage 截止点，注明未覆盖的最终回复或其他调用。使用当前用户请求或委派任务的
   语言，无明确语言时用英语。默认不展开模型、费用和完整表格。
   用户要求详细审计，或多 agent/不同范围需要展开才能说明时，再列出分项、实际模型/推理强度、
   来源、缺失范围及费用依据；费用无法归属时填「未知」，不能由订阅额度推算。
5. 将查询放在最后一次必要验证之后，与验证合并到同一个工具调用，只输出必要的用量摘要。
   交接或明确要求统计而没有验证可合并时，只读查询一次即可，不虚构验证步骤。
   验证失败仍如实报告；查询成功不能替代验证结果。若需交接，使用已有快照，不追赶实时计数。

交接只需要最小必要的用量数字、范围和来源。报告中避免写入凭证、请求或响应正文以及完整日志。
使用执行任务时已有的用量记录和可用的只读接口，禁止为了填报另外启动 agent 或发起模型调用。

## Codex 会话 usage 读取步骤

这里的 Codex usage 指运行时记录的 token 消耗，不是账户剩余额度。复用已验证的读取方式；
仅在环境/版本变化或读取失败时检查 `codex --version` 与 `codex --help`，不要每次重新探索。
若命令列表明确支持 `usage`，再读 `codex usage --help`，按该版本支持的
会话筛选参数查询当前线程。不能将不支持的 `codex usage` 当作提示词执行。
2026-11-11 本机 PATH CLI `0.162.1` 与 daemon CLI `0.167.2` 均未列出此子命令，
以下本地日志方式已在当前开发会话实测。无需额外推理或安装统计工具。

### 当前线程与最小只读查询

从执行环境读取 `CODEX_THREAD_ID`，使用 `CODEX_HOME`（未设置时为 `~/.codex`）。
不要凭“最近修改”选择其他聊天。缺少 ID 时从宿主的当前聊天元数据确认；无法确认就报告
该限制，不读取其他聊天来凑数。仅解析 usage 与运行时模型字段，不输出消息正文或凭证。

优先使用最新 `token_usage_record.payload.thread_token_usage`（会话累计）及
`turn_token_usage`（该 `turn_id` 累计）。旧格式使用最新有效 `event_msg` / `token_count`
的 `info.total_token_usage`。累计快照只能取一次，不能逐条相加；两种格式也不能相加。

将以下只读查询放入最后一次验证的同一个工具调用，在验证命令之后执行（例如本仓库文档
变更的 `node scripts/check.mjs` 和 `git diff --check`）。输出为紧凑 JSON，供 agent 生成
一行简报；其中是**会话累计和最新轮次**，不是自动识别出的跨轮任务总量。不要单独输出
日志或逐调用明细，也不要把会话累计与最新轮次相加。

```sh
python3 - <<'PY'
import json
import os
from pathlib import Path

thread_id = os.environ.get("CODEX_THREAD_ID")
if not thread_id:
    raise SystemExit("CODEX_THREAD_ID 缺失；先从宿主确认当前聊天 ID")
codex_dir = Path(os.environ.get("CODEX_HOME") or str(Path.home() / ".codex"))
paths = [p for folder in ("sessions", "archived_sessions")
         for p in (codex_dir / folder).rglob(f"*{thread_id}*.jsonl")]
if len(paths) != 1:
    raise SystemExit(f"当前线程匹配 {len(paths)} 个日志；需检查存储方式，不能猜测")
latest = None
context = {}
with paths[0].open() as stream:
    for line in stream:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue  # 活跃日志末尾可能尚未写完
        payload = event.get("payload") or {}
        kind = event.get("type")
        if kind == "turn_context":
            context = {k: payload.get(k) for k in ("turn_id", "model", "effort")}
        if kind == "token_usage_record" and payload.get("thread_id") == thread_id:
            if payload.get("thread_token_usage"):
                latest = {
                    "source": "token_usage_record",
                    "timestamp": event.get("timestamp"),
                    "thread_id": thread_id,
                    "turn_id": payload.get("turn_id"),
                    "session_usage": payload["thread_token_usage"],
                    "turn_usage": payload.get("turn_token_usage"),
                    "runtime_context": context.copy(),
                }
        elif kind == "event_msg" and payload.get("type") == "token_count":
            info = payload.get("info") or {}
            if info.get("total_token_usage") and (
                latest is None or latest["source"] != "token_usage_record"
            ):
                latest = {
                    "source": "token_count",
                    "timestamp": event.get("timestamp"),
                    "thread_id": thread_id,
                    "session_usage": info["total_token_usage"],
                    "runtime_context": context.copy(),
                }
if latest is None:
    raise SystemExit("当前日志尚无有效 usage；报告此限制，不填零")
print(json.dumps(latest, ensure_ascii=False, separators=(",", ":")))
PY
```

示例优先保留原生 `token_usage_record`，截止点取其时间戳；后续旧格式通知不覆盖它。
日志不存在不等于用量为零。使用分页历史的版本可能改用本地数据库：先检查当前版本的
只读历史/usage API；必要时以 SQLite `mode=ro` 检查 `state_*.sqlite` 的 `threads` 元数据、
`rollout_path` / `history_mode` 及 `thread_history_*.sqlite` 的实际 schema，再按当前线程 ID
筛选对应 usage。不要假设数据库版本号或表结构固定，不要迁移或修改运行时数据库。
`threads.tokens_used` 单一计数不能推导输入/缓存/输出，也不能当作完整分类用量。
若仍无法读取，列出已查来源和具体错误；不要仅写“没有用量工具”。

### 字段与任务边界

| 报告字段 | Codex usage 字段 / 来源 |
| --- | --- |
| 输入 | `input_tokens`（包含缓存输入） |
| 缓存输入 | `cached_input_tokens`（输入的子集，不再加到总计） |
| 输出 | `output_tokens` |
| 总计 | `total_tokens`；若缺失，只有确认输入与输出完整且口径相容才相加 |
| 推理 token | `reasoning_output_tokens`，已计入输出时不重复相加 |
| 实际模型 / 推理强度 | 对应 turn 的 `turn_context.model` / `effort` |
| 截止点 | 被采用记录的 `timestamp`，而非运行查询命令的时间 |

- 当前任务只有一轮且 `turn_id` 匹配时，可使用该轮最新 `turn_token_usage`。
  多轮任务应明确起止 turn，按每个 turn 的最终累计去重求和；也可在同一线程、计数口径
  未重置时计算“结束累计 − 任务开始前累计”。不要把每次累计快照相加。
  `last_token_usage` 仅是最近一次调用，不能代表整轮或整个任务。
- 若需要逐调用汇总，用 `token_usage_record` 中的 `response_id` 等调用标识去重，
  不能同时再加 turn/thread 累计。遇到 fork、计数重置或缺少起始记录，先核对覆盖范围；
  无法确认时只展示带范围说明的会话累计。已有历史而缺少基线时，不假设基线为零。
- 同一会话切换模型时，当前 `turn_context` 只能证明对应轮次的模型；跨模型累计注明
  “多模型”或按轮拆分，不能将所有 token 归给最后一个模型。
- 子 agent 分别提供线程 ID、turn/调用范围和 usage；先确认父计数是否已含子调用再汇总。
  无法去重时保留分项，不生成不可靠的总计。
- 仅在报告触发时查询一次，并优先合并到最后一次验证。最终回复及查询之后尚未落盘的
  调用通常不在结果内，必须标明；默认一行简报不列费用，详细报告缺少费用依据时填「未知」。
