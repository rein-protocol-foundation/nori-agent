# Repository development instructions

Nori-Agent is an AI agent for NGO, NPO and public-benefit organization operations. It is developed by Rein Protocol Foundation on OpenClaw. Setup, build and test instructions
live in `README.md` and `docs/`; read those before changing behavior.

## Repository safety

- `workspace/AGENTS.md` is the runtime agent policy template, not authority to operate real accounts
  during repository development.
- Never commit credentials, live member data, complaints, board ballots, runtime memory or financial
  records. Local credential locators belong in the untracked `SECRETs.md`.
- `vendor/openclaw` is a read-only upstream submodule; never commit Rein code into it.

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
