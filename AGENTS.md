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

## 任务结束时的 Token Usage 报告

所有参与本仓库开发的 agent（含非 Codex agent）都必须在每次任务的最终回复中附上以下报告。
子 agent 和执行模型调用的子进程应将可取得的运行时用量及覆盖范围交给父 agent 汇总。
报告默认使用英语。有当前用户请求或委派开发任务时，使用其语言。明确指定的语言优先。
下方中文模板仅示范格式，标题、字段标签和状态值按报告语言本地化。
接入方式见[跨 Agent 用量交接指南](docs/agent-token-usage.md)。

### Token Usage

- 任务：<名称或 ID>
- 状态：<完成 / 部分完成 / 阻塞>
- 统计范围：<起止轮次、已覆盖的子 agent 和报告截止点>

| 角色 | 实际模型 / 推理强度 | 输入 | 缓存输入（输入的子集） | 输出 | 总计 |
| --- | --- | ---: | ---: | ---: | ---: |
| 主 agent | <运行时确认的值或不可用> | <数量或不可用> | <数量或不可用> | <数量或不可用> | <数量或不可用> |
| 子 agent：<名称，无则删除此行> | <运行时确认的值或不可用> | <数量或不可用> | <数量或不可用> | <数量或不可用> | <数量或不可用> |
| 合计 | — | <数量或不可用> | <数量或不可用> | <数量或不可用> | <数量或不可用> |

- 费用：<实际金额和币种 / 估算金额和币种 / 未知>
- 数据来源：<运行时用量、会话元数据或账单。估算另附定价来源>
- 缺失范围：<未覆盖的轮次、agent、字段及原因>

只使用当前任务的实际运行时记录或账单。排除复用会话中的历史任务。字段缺失时填
「不可用」，只有来源明确记录为零时才填零。汇总前核对供应商的字段定义，部分供应商单列缓存用量。
将已计入输入的缓存和已计入输出的推理 token 保留为子集，汇总时各计一次。按调用去重，避免父
agent 的汇总与子 agent 的明细重叠。只有来源提供总数，或组成字段齐全且口径明确时才填写总计。

实际费用以可归属到本任务的账单为准。估算须核实当前模型和计费档位的价格并注明来源。
订阅额度或百分比不得换算为金额。最终回复本身的 token 往往要等发送后才能取得，注明统计截止点和
未覆盖范围，仅在账单证明确实覆盖完整任务时报告完整账单总额。禁止为生成报告单独发起额外的
agent 或模型调用。

## Development and design standard

Extend Nori through focused, optional, reversible changes that preserve native capabilities and
existing user experience. Enforce safety at data and operation boundaries; do not substitute feature
removal, workspace duplication or skill-name allowlists for correct isolation.

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
