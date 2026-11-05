# Three job-matching acceptance cases

All candidate profiles are synthetic. Evaluate with `workspace/skills/nori-job-matching/SKILL.md`.
Reference date: 2026-11-04 America/Los_Angeles (2026-11-05 UTC). For a repeatable offline rehearsal,
use the summarized source observations below as tool results; do not claim a fresh live check.
For a live run, fetch the links again and allow the expected listing status to change with evidence.
These cases test recommendation decisions, separately from the automated runtime integration tests.

## 1. Qualified candidate; board shell; employer fallback

**User input:**

> 我有 6 年生产环境全栈经验，计算机本科，Python、TypeScript、React 和云基础设施都做过，
> 在初创公司负责过从用户访谈到上线的完整功能，也做过实时日志平台，日常使用 Codex。
> 我住伦敦，有不需要雇主担保的英国工作许可，英语工作熟练，接受线下全职。
> 想找 AI 安全相关产品工程岗位，优先八万个小时，也可以查雇主官网。

**Source observations:**

- `https://jobs.80000hours.org/` returned navigation and filters without usable job records.
- Employer posting: [Apollo Research — Full-stack Software Engineer (Product)](https://jobs.lever.co/apolloresearch/ab3051f4-d5be-4b46-9f54-eb14da1a6a54).
  Observed full-time, London/San Francisco on-site, 4+ years production software, full-stack
  Python/TypeScript, product ownership and coding-agent experience. Formal AI safety background
  is explicitly unnecessary. No closing date was found.
- Its [application page](https://jobs.lever.co/apolloresearch/ab3051f4-d5be-4b46-9f54-eb14da1a6a54/apply)
  rendered a form for the same role. No fields were entered or submitted.

**Expected decision:** A verified current vacancy and strong fit for the supplied London profile.
The missing formal AI safety background is not a disqualifier. Explain production/full-stack fit,
identify enterprise security experience as a potential gap, and suggest highlighting the log-platform
project. No sponsorship is needed according to the user; do not infer citizenship. Say the source
is the employer fallback, not a verified current 80,000 Hours listing. Do not invent a deadline.

**Observed manual rehearsal:** Returned one strong-fit employer opportunity with the above fit,
gap and next step; did not pad to three roles or treat the shell as zero vacancies. Pass.

## 2. Same technical fit; location fails; sponsorship uncertain

**User input:**

> 技术和教育背景同案例 1，但我在新加坡，只能从新加坡远程工作，不能搬家或定期去办公室，
> 没有英国或美国工作许可。如果我改为愿意搬到伦敦，这个岗位是否一定能给我办签证？

**Source observations:** Use the same employer page as case 1. It describes office-based work with
some WFH flexibility, not global remote work. Its sponsorship wording offers UK/US sponsorship
support but explicitly says it is not guaranteed for every role or candidate.

**Expected decision:** Exclude the role from this user's viable shortlist due to the on-site
constraint. Occasional WFH does not meet Singapore-only remote. In the user's hypothetical relocation
scenario, the role becomes conditional on individual sponsorship confirmation, not guaranteed viable.
Suggest asking whether this specific role can sponsor a Singapore-based candidate relocating to
London. Do not substitute a contractor arrangement or infer authorization from residence/language.

**Observed manual rehearsal:** Excluded for current location constraints; treated the relocation
hypothesis separately as conditional and supplied the sponsorship question. Pass.

## 3. Stale search results and unavailable employer page

**User input:**

> 我有 5 年视频制作和运营经验，本科，中文母语、英语工作熟练，在新加坡，可搬伦敦但需要
> 签证支持。只找现在开放的带薪全职岗位。请检查 80,000 Hours 的 Senior Video Operations
> 和 Chief of Staff，不要替我投递。

**Source observations:**

- [Senior Video Operations employer page](https://80000hours.org/2026/05/senior-video-operations/)
  remains readable but states a June 15, 2026, 11 PM PT deadline, before the reference date.
- The search index surfaced an “Expression of Interest: Chief of Staff (Operations Team)” lead.
  Opening [its employer page](https://jobs.ashbyhq.com/80000hours/14c09cff-8f39-4719-b865-209bd0994f84)
  returned a 404 in this run.

**Expected decision:** No verified current vacancy among these two links. Exclude the first as
expired. Label the second as unavailable/unverified; a 404 alone does not prove the employer has
closed hiring, and an expression of interest is not a specific active vacancy. Do not conflate
these results with “there are no jobs in the market.” Offer a fresh operations search using the
same location/sponsorship constraints. No profile upload, email or application submission.

**Observed manual rehearsal:** First excluded as expired; second retained only as an unverified
lead, with no claim of an active vacancy or guaranteed sponsorship. Pass.

## Evidence boundary

The source observations above came from live public web reads during this change. The decisions
were manually rehearsed by the implementing assistant, not an independent model evaluation or
a production Discord/Slack conversation. `tests/job-matching-skill.test.mjs` separately executes
three automated integration cases for staging/tool confinement, rejected filesystem escapes, and
legacy compatibility. `scripts/verify-job-matching.mjs` checks real OpenClaw discovery without a model.
