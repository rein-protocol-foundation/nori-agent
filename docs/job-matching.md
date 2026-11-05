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
- It lives in the repository's ordinary `workspace/skills/nori-job-matching/` directory and is
  routed by `workspace/AGENTS.md`. Use it only in an ordinary workspace; it has no dependency on
  the Rein Discord, Slack or isolation plugins. Separate deployed workspaces do not acquire it
  automatically. This change adds no isolated-channel compatibility or tool permissions.
- 本次交付仅用于普通工作区，不安装到隔离版 Discord/Slack 工作区。使用已有的实时搜索、
  网页读取或获授权浏览器能力；线上 Nori 尚未部署或验证。
- Recommendations do not authorize applications, recruiter contact, alerts or profile uploads.
  用户履历与签证信息不写入共享工作区，不自动发送给职位平台或雇主。

## Verification / 验证

[Three candidate test cases](../tests/fixtures/job-matching-cases.md) contain synthetic profiles,
source observations, expected decisions and manual rehearsal outcomes:

1. Qualified London engineer: board-shell fallback, employer verification and a suitable role.
2. Singapore-only remote candidate: on-site exclusion and conditional sponsorship under relocation.
3. Operations candidate: expired deadline and an unavailable expression-of-interest lead.

Run with the repository's supported Node toolchain:

```sh
npm run toolchain:pnpm -- exec node scripts/verify-job-matching.mjs
npm run toolchain:pnpm -- run check
```

`verify-job-matching.mjs` stages only this skill in a temporary ordinary workspace and asks the real
OpenClaw CLI to discover it; it asserts workspace provenance, enabled state and eligibility.
Plugins are disabled, demonstrating that neither channel/isolation plugins nor the community
catalog skill are needed. It starts no gateway, model or chat account. The frontmatter validator passed
using PyYAML in an isolated `uv run --with pyyaml` environment; no project Python dependency was added.

The live source reads and manual decision rehearsals validate the research workflow, not production
chat delivery or independent model compliance. Runtime tools still need a configured search provider
and network access. Production deployment is separate from this local verification.
