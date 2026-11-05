# Personalized public job discovery / 个性化公开职位搜索

The [nori-job-matching skill](../workspace/skills/nori-job-matching/SKILL.md) implements the
user-requested public career-search workflow as agent instructions. It is adjacent to PRD R01's
voluntary region/interest-based guidance, but external job matching is an extension, not a claim
that R01 or the existing P0 acceptance criteria require or validate recruiting functionality.

新增技能根据用户自愿提供的履历、教育、地区、语言和工作许可筛选公开职位。先核对硬性条件，
再解释经验与兴趣的匹配；签证支持不明、远程聘用地域不明的岗位单独列为待确认。
该能力是本次用户要求的扩展，不代表原有 P0 招聘功能已验收。

## Sources and runtime boundary / 来源与运行边界

- Start at the [80,000 Hours job board](https://jobs.80000hours.org/), then verify employer postings.
  Its [October 2026 update](https://80000hours.org/2026/10/half-year-update-q1-q2-2026/)
  describes a narrower AI-focused scope and inclusion of courses. Recheck scope when using it;
  neither every listing is employment nor every nonprofit field is covered.
- The skill relies on live public search/page-reading or an authorized browser, not a new API or
  scraper. No credentials, dependencies or persistent candidate database are added.
- It lives in the repository's normal `workspace/skills/` location. Separate deployed workspaces
  do not acquire it automatically. Discord/Slack guards now accept it as an optional reviewed
  instruction-only skill alongside the required `rein-community-discovery` skill. Existing
  workspaces remain valid without it. Unknown skills, additional files and filesystem links remain
  rejected. No tool allowlist is expanded and no production workspace is changed.
- 本次交付包含技能与隔离运行环境的加载兼容修复；线上 Nori 尚未部署或验证。
  隔离频道使用已有 `web_search` / `web_fetch`，不会尝试调用未开放的浏览器执行工具。
- Recommendations do not authorize applications, recruiter contact, alerts or profile uploads.
  用户履历与签证信息不写入共享工作区，不自动发送给职位平台或雇主。

## Verification / 验证

[Three candidate test cases](../tests/fixtures/job-matching-cases.md) contain synthetic profiles,
source observations, expected decisions and manual rehearsal outcomes:

1. Qualified London engineer: board-shell fallback, employer verification and a suitable role.
2. Singapore-only remote candidate: on-site exclusion and conditional sponsorship under relocation.
3. Operations candidate: expired deadline and an unavailable expression-of-interest lead.

Automated [integration tests](../tests/job-matching-skill.test.mjs) cover three runtime cases across
both Discord and Slack: valid staging without exec; rejection of unknown skills, data/scripts and
link escapes; backward compatibility and retention of the catalog skill requirement.

Run with the repository's supported Node toolchain:

```sh
npm run toolchain:pnpm -- exec node --test tests/job-matching-skill.test.mjs
npm run toolchain:pnpm -- exec node scripts/verify-job-matching.mjs
npm run toolchain:pnpm -- run check
```

`verify-job-matching.mjs` stages the actual skill in a temporary workspace and asks the real
OpenClaw CLI to discover it; it asserts workspace provenance, enabled state and eligibility.
It starts no gateway, model or chat account. The skill-creator frontmatter validator also passed
using PyYAML in an isolated `uv run --with pyyaml` environment; no project Python dependency was added.

Local verification on 2026-11-04 (Los Angeles): all 62 focused channel/skill tests passed;
the full suite rerun passed 1,226 tests with 2 skips and no failures. The first full run had one
Console shutdown timing failure; its four-test file passed in isolation and the full rerun passed.
`check`, plugin loader inspection, and the native Discord and Slack isolation probes also passed.
Those native probes use synthetic providers/accounts and check regressions, not real job advice.

The live source reads and manual decision rehearsals validate the research workflow, not production
chat delivery or independent model compliance. Runtime tools still need a configured search provider
and network access. Before deploying a separate public workspace, stage only the two reviewed
`SKILL.md` files with the updated routing policy and adapter code; never copy the operator workspace
wholesale. Production deployment is separate from this local verification.
