---
name: rein-people
description: Prepare authorized additions and updates to public People profiles on the Rein Protocol Foundation website, including approved portraits, role groups, and explicit homepage staff selection.
---

# Rein Foundation People profiles

Use the latest checkout of [ReinProtocolFoundation](https://github.com/rein-protocol-foundation/ReinProtocolFoundation). Read its `AGENTS.md` and canonical `skills/rein-people/SKILL.md` before editing. If the canonical instructions are unavailable, report the missing dependency and pause the edit.

- Confirm the profile owner's approval for each public field and portrait, and verify the Foundation role with an authorized Foundation operator. Use the explicitly confirmed role ID: `board`, `staff`, `core_contributor`, `contributor`, or `community_member`. A professional title, degree, employer, or public profile cannot establish a Foundation role or confer privileges. Keep private source material and account data out of the website repository and shared workspace.
- Follow the canonical workflow to update `data/people.json` and place an approved WebP portrait under `public/people/`. Feature only explicitly selected staff-tier profiles (`board` or `staff`), with at most four on the homepage.
- In the Foundation checkout, run `npm run validate:people`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Review the diff and report the affected profile, role, homepage placement, validation results, and any unresolved approvals. If authorized to open a PR, verify and report its CI results.
- Obtain explicit authorization for opening a PR, merging, deploying, or publishing. The skill grants no account access or permission to perform those actions.
