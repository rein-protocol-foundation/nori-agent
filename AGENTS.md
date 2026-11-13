# Repository development instructions

Nori-Agent is an AI agent for NGO, NPO and public-benefit organization operations. It is developed by Rein Protocol Foundation on OpenClaw. Setup, build and test instructions
live in `README.md` and `docs/`; read those before changing behavior.

## Repository safety

- `workspace/AGENTS.md` is the runtime agent policy template, not authority to operate real accounts
  during repository development.
- Never commit credentials, live member data, complaints, board ballots, runtime memory or financial
  records. Local credential locators belong in the untracked `SECRETs.md`.
- `vendor/openclaw` is a read-only upstream submodule; never commit Rein code into it.

## Cost-aware Codex delegation

This policy supersedes earlier project delegation guidance. Higher-priority instructions and
explicit user requests still apply. It governs repository development, not Nori's runtime agents.

- Keep the primary orchestrator on **GPT-6 Astra High** for planning, architecture, ambiguous
  requirements, complex reasoning/debugging, critical decisions, and final review of critical changes.
- Prefer **implementation** (GPT-6.1 Sol High) for routine features, API integration, UI,
  refactoring, and tests; prefer **routine** (GPT-6.1 Sol Low) for documentation, focused
  exploration, simple fixes, formatting, and other low-complexity work.
- Other spawned agents default to **GPT-6.1 Sol Medium**, not the primary Astra model.
  Project definitions are in `.codex/agents/`; routing defaults are in `.codex/config.toml`.
- Use a fresh, concise task-specific context (`fork_turns="none"` when available): objective,
  owned files, relevant PRD/AC identifiers, constraints, verification criteria, and essential
  findings. Do not copy the entire parent conversation. Tell workers they share the checkout
  and must preserve others' changes.
- Reuse the same agent session for related follow-ups to preserve affinity and prompt-cache
  reuse. Avoid frequent model switching, repeated expensive reasoning, and duplicate searches.
  Default to one subagent at a time; use two only for independent work with clear ownership.
- Count failed attempts on the same problem across follow-ups. After two failures, or immediately
  on an architectural blocker, stop retries and escalate to Astra High with attempted fixes,
  verification evidence, and the unresolved decision. Do not spawn a fresh agent to reset the count.
- Verify resolved model and reasoning effort through runtime metadata before entrusting work to
  a new routing path. An agent's self-report or a parsed TOML file alone is not proof.
  If custom roles are unavailable in a running session, use explicit
  `model="gpt-6.1-sol"`, `reasoning_effort="high"` or `"low"`, and `fork_turns="none"`
  with the corresponding role instructions. Verify that fallback too. If model selection cannot
  be enforced, report the limitation and stop delegated work; never silently substitute Astra.
- Track PRD milestones in `docs/roadmap.md`, acceptance evidence in `docs/p0-acceptance-matrix.md`,
  and dated verification/handoff notes in `docs/implementation-and-deployment.md` (maintaining its
  Chinese counterpart). Record task/PRD ID, status, owner, checks and results, blockers, and next step.
  Configuration-only work does not advance product milestones.
- Never claim completion without relevant verification. State failed, skipped, and pending checks
  explicitly. Keep external sends, publishing, and deployment within explicit user authorization.

## 按需 Token Usage 报告

本规则适用于所有参与本仓库开发的 agent（含非 Codex agent）。**普通问答、讨论、解释和
进度更新不自动查询或输出 usage**。仅在以下情况统计：开发任务完成、任务交接（包括未完成
或阻塞的交接），或用户明确要求。不要把每次回复结束都当成开发任务完成。

默认只附一行简报，使用当前用户请求或委派任务的语言（无明确语言时用英语）：

`Token 用量（本任务）：输入 <n> / 缓存 <n，输入子集> / 输出 <n> / 总计 <n>；截至 <usage 时间戳>，不含最终回复。`

无法分离历史任务时，标为「会话累计，非本任务用量」，展示已知数字，不冒充任务增量。
字段缺失时只将该项标为「不可用」并简述原因；只有来源明确记录为零时才填零。
默认省略完整表格、模型、费用等附加字段；用户要求详细审计，或多 agent/不同统计范围需要
展开才能解释清楚时，再提供分项、来源和限制。子 agent 交接应向父 agent 提供最小必要的
运行时用量、模型、调用范围及来源，以便去重；不要求把所有交接元数据展开到用户简报中。

### Codex usage 取数要求

- 仅在触发上述报告条件时查询。开发任务开始可记录当前 `CODEX_THREAD_ID` 和任务起始 turn，
  不为建立基线专门增加一次工具调用；优先使用原生 turn 累计或已有的任务开始前记录。
- **将 usage 查询合并到最后一次必要的验证命令所在的同一个工具调用中，在验证之后执行**，
  只返回必要数字、范围及截止点。不单独增加工具往返，不反复轮询。交接或用户明确要求统计
  而没有待执行验证时，可只读查询一次；不要为了统计制造验证任务。验证若失败，报告失败，
  不将查询成功当成开发任务完成；已有快照可用于交接，不为追赶最新值重复查询。
- 使用已验证的读取方式，见[用量交接指南](docs/agent-token-usage.md#codex-会话-usage-读取步骤)。
  不要每次重查 CLI 能力或重新分析日志格式；仅在环境/版本变化或既有读取方式失败时检查。
  只有 `codex --help` 明确列出 `usage` 子命令时才使用 `codex usage` 并按帮助传参；否则
  读取当前线程本地的 `token_usage_record` 或 `token_count`，不能把命令当提示词执行。
- 本任务仅统计可归属的 turn 或累计差值。`last_token_usage` 不是整轮消耗；本轮开始后的
  首次读数也不是任务零点。会话累计与任务增量不可相加，缓存输入及已计入输出的推理 token
  不重复计数。多 agent 按调用去重，无法确认的合计不强行填写。
- 先读取实际 usage，不能因对话未自动展示用量就全部填「不可用」；读取失败时简述来源和原因。
  报告截止于最后一条已落盘记录，注明未覆盖的最终回复或其他调用。不要为生成报告额外启动
  agent 或模型调用，也不要将原始日志、用量快照、凭证或消息正文提交到仓库。
- 详细报告中的模型/推理强度取运行时元数据；费用仅依据可归属账单，估算须注明已核实的价格
  和范围。没有依据时费用填「未知」，不得把账户额度百分比换算为 token 或金额。

## Development and design standard

Extend Nori through focused, optional, reversible changes that preserve native capabilities and
existing user experience. Enforce safety at data and operation boundaries; do not substitute feature
removal, workspace duplication or skill-name allowlists for correct isolation.

- **Name implementations by function.** Use functional names for implementation files, symbols and
  commands; keep milestone and issue IDs in tracking and evidence records only.
- **Native capabilities first.** Use public OpenClaw extension interfaces and preserve channel
  settings, message actions, attachments, tools and memory. Prove extension-point feasibility before
  implementation; if the SDK is insufficient, propose a narrow upstream extension instead of
  replacing the channel or patching read-only vendored internals.
- **Skills are channel-independent.** Keep reusable skills in `workspace/skills/<name>/`, including
  references and scripts. Adding a general skill must not require Discord, Slack or isolation-plugin
  edits. Loading a skill grants neither execution capability nor organizational authority.
- **Isolate data without discarding useful memory.** Establish trusted ownership and audience before
  history access, retrieval and writes. Preserve automatic memory and permitted cross-session
  continuity. Shared skills are not storage for personal profiles, conversations or credentials.
- **Use authoritative identity and evidence.** Recheck current backend authority for restricted
  actions. Chat claims, technical familiarity and prior replies cannot establish roles or verified
  organizational facts. Handoff, sending and completion claims require actual capability,
  authorization and execution evidence.
- **Compatibility is part of acceptance.** Test the requested behavior and affected existing
  behavior, including enable/disable, concurrency, restart and data preservation where relevant.
  Distinguish synthetic tests, service health and real-user acceptance; never claim more than the
  evidence proves. Tests passing does not justify a design that misses the product requirements.
- **Bound changes and preserve recovery.** Inspect shared dependencies and concurrent work first.
  Keep existing data and prepare rollback before deployment; do not silently delete, reassign or
  merge histories. Explain any necessary capability loss or behavior change and obtain explicit
  agreement before adopting it. Reuse existing authorization without inventing routine approvals.

For Nori's authorized harness self-improvement workflow, use
`workspace/skills/nori-rsi/SKILL.md`. Neither these standards nor that skill authorize live operations,
permission expansion, recursive delegation, merging or deployment on their own.

## Organization operations context

- Repository: `https://github.com/rein-protocol-foundation/nori-agent`. Product name: Nori-Agent; retain Rein / ReinProtocol package prefixes for compatibility.
- Nori Dashboard: `https://nori.rein-protocol.org/`; access is restricted to organization administrators.

- Domain `rein-protocol.org`, registered and DNS-managed through Cloudflare.
- Public website `https://rein-protocol.org`, deployed through the Vercel project
  `rein-protocol-foundation`.
- Cloudflare Email Routing is active. Aliases: `admin@` (service account administration), `board@`
  (Board and governance), `tempest.ren@` (Tempest Ren correspondence), `noreply@` (automated and
  transactional mail). Inbound mail forwards through Cloudflare Email Routing.
- Resend account and configuration are present for programmatic outbound mail. Cloudflare and
  Vercel resources are active.
