# Nori-Agent

**AI-powered operations for NGOs, nonprofits, and public-benefit organizations.**

[![Scaffold checks](https://github.com/rein-protocol-foundation/nori-agent/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/rein-protocol-foundation/nori-agent/actions/workflows/check.yml)
[![Status: in development](https://img.shields.io/badge/status-in_development-d97706?style=flat)](#current-status)
[![Built on OpenClaw](https://img.shields.io/badge/built_on-OpenClaw-2563eb?style=flat)](https://github.com/openclaw/openclaw)
[![Local Node.js toolchain: 24.16.0](https://img.shields.io/badge/Node.js-24.16.0-5fa04e?style=flat&logo=nodedotjs&logoColor=white)](#quick-start)
[![pnpm 12.4.2](https://img.shields.io/badge/pnpm-12.4.2-f69220?style=flat&logo=pnpm&logoColor=white)](package.json)
[![Dashboard: admins only](https://img.shields.io/badge/dashboard-admins_only-475569?style=flat)](https://nori.rein-protocol.org/)

[简体中文](README-zh.md) · [GitHub](https://github.com/rein-protocol-foundation/nori-agent) · [Nori Dashboard](https://nori.rein-protocol.org/)

<img src="workspace/avatars/rein-agent.png" alt="Nori, the Nori-Agent mascot" width="160" height="160">

Nori helps organizations coordinate people, resources, decisions, and community work around their mission. The goal is to handle most routine operations within each organization's policies, giving people more time for public-benefit work and decisions that need human judgment.

Built on **OpenClaw** by **Rein Protocol Foundation**, the agent goes by **Nori** in conversation. The Foundation provides the initial implementation context; each organization supplies its own mission, roles, policies, and integrations.

> **Nori Dashboard is restricted to organization administrators.** Access requires authorized management credentials.

[Capabilities](#capabilities) · [Current status](#current-status) · [Quick start](#quick-start) · [Documentation](#documentation) · [Contributing](#contributing)

## Capabilities

Nori-Agent is designed around four areas of organizational work:

| Area | Product goal |
| --- | --- |
| Daily operations and decisions | Triage requests, prepare meetings, follow up on tasks, and resolve routine matters under authorized policies. |
| Financial resource coordination | Assess resource needs, support budget decisions, and track allocations and commitments. |
| People coordination | Support members, staff, and volunteers through onboarding, responsibilities, and contribution tracking. |
| Community maintenance | Guide newcomers, help people discover resources and events, and support participation and feedback. |

The broader product direction also considers fundraising and donor relations, program delivery, impact evaluation, governance and compliance, protection and participation of people served, and external communications and partnerships. These remain **proposals for discussion**, rather than confirmed first-release commitments. See the [product requirements](docs/PRD-agent-community-operations.md).

## Current status

**The project has a local business core, development rehearsals, and limited live acceptance evidence. The full product scope is still in development.**

| Component | Available implementation | Current boundary |
| --- | --- | --- |
| Proposals and governance | Identity binding, proposal collection and submission, Board voting, result records, and funds snapshots through an authenticated backend. | Requires explicit backend, workspace, and channel configuration. A vote result does not execute a payment. |
| Community support | Discord onboarding guidance and authenticated resource and event discovery. | Requires configured services and verified community access. Limited live acceptance does not establish general readiness. |
| Session and memory isolation | Optional Discord and Slack adapters with per-user and audience scopes. | Synthetic pipeline checks exist; live two-account acceptance remains pending. |
| Model routing | Optional Magpie gateway, manual model selection, and Jev dynamic routing. | Provider access and billing compatibility require operator verification. |
| Browser tasks | Pinned agent-browser integration with an encrypted credential vault and session reuse. | Runs within operator authorization and existing channel permissions. |

The initial governance workflow is:

**Verified identity → proposal → Board vote → recorded result**, with funds snapshots available to authorized directors.

Real payments, fund reservations, automatic role grants, and the full activity-to-publication workflow are not enabled. The Agent accesses organizational data through the backend API and holds no database credentials.

For dated evidence and outstanding checks, read the [implementation record](docs/implementation-and-deployment.md), [acceptance matrix](docs/p0-acceptance-matrix.md), and [roadmap](docs/roadmap.md).

## Quick start

### 1. Prepare the checkout and toolchain

You need Git with submodule support and npm. The commands below install a local toolchain with Node.js `24.16.0` and pnpm `12.4.2`. Supported Node releases are `>=24.16.0 <25` or `>=26.1.0`.

```sh
git clone --recurse-submodules https://github.com/rein-protocol-foundation/nori-agent.git
cd nori-agent
npm install --prefix .toolchain --no-save --package-lock=false node@24.16.0 pnpm@12.4.2
```

For an existing checkout without submodules, run `git submodule update --init --recursive` first. The local toolchain is Git-ignored and does not require a global pnpm installation or a `PATH` change.

### 2. Install, build, and initialize

```sh
npm run toolchain:pnpm -- install
npm run toolchain:pnpm -- --dir vendor/openclaw install --frozen-lockfile
npm run toolchain:pnpm -- --dir vendor/openclaw build
npm run toolchain:pnpm -- run setup:local
```

Initialization creates a private local configuration at `runtime/openclaw/openclaw.json`, enables `rein-operations`, and binds the gateway to loopback port `18791`. **Chat channels and models remain unconfigured.** Follow the [setup guide](docs/setup.md) to connect services and explicitly enable backend tools.

### 3. Verify and run

```sh
npm run toolchain:pnpm -- run check
npm run toolchain:pnpm -- test
npm run toolchain:pnpm -- run verify:plugin
npm run toolchain:pnpm -- openclaw gateway run
```

After the gateway reports ready, check it from a second terminal:

```sh
npm run toolchain:pnpm -- openclaw gateway health --port 18791
npm run toolchain:pnpm -- run smoke:gateway
```

### Optional: model routing

Magpie bootstrap also requires Go. Prepare the pinned gateway, then start the integrated console:

```sh
npm run toolchain:pnpm -- run magpie:setup
npm run toolchain:pnpm -- run router:ui
```

Keep the console running alongside OpenClaw. Configure providers and models in Magpie; the console synchronizes the OpenClaw configuration. See [subscription access and dynamic routing](docs/unified-subscription-access.md) for configuration and verification.

## Documentation

| Read about | Start here |
| --- | --- |
| Product scope and priorities | [Product requirements](docs/PRD-agent-community-operations.md) · [Roadmap](docs/roadmap.md) · [Open decisions](docs/decisions.md) |
| Installation and configuration | [Setup](docs/setup.md) · [Model routing](docs/unified-subscription-access.md) · [Browser automation](docs/agent-browser.md) |
| Community workflows | [Discord onboarding](docs/discord-onboarding.md) · [Community discovery](docs/community-discovery.md) |
| Identity and privacy | [Conversation identity](docs/conversation-identity.md) · [Channel isolation](docs/channel-user-isolation.md) |
| Architecture and integration | [Architecture](docs/architecture.md) · [Integration contracts](docs/integration-contracts.md) · [OpenClaw updates](docs/upstream.md) |
| Implementation evidence | [Development and deployment](docs/implementation-and-deployment.md) · [Acceptance matrix](docs/p0-acceptance-matrix.md) |
| Foundation context | [Mission and governance blueprint](PROJECT.md) · [Source provenance](docs/provenance.md) |

## Repository layout

| Path | Purpose |
| --- | --- |
| `plugins/rein-operations/` | Proposal, governance, identity, and community tools. |
| `plugins/rein-router/` | Magpie gateway integration and model routing. |
| `plugins/rein-discord/`, `plugins/rein-slack/`, `plugins/rein-isolation/` | Channel adapters and shared isolation logic. |
| `workspace/` | Agent identity, operating policies, skills, and avatar. |
| `config/`, `templates/` | Example configurations and workflow templates. |
| `scripts/`, `tests/` | Setup, verification, runtime helpers, and tests. |
| `docs/` | Requirements, guides, decisions, and acceptance records. |
| `vendor/openclaw/` | Official runtime, pinned as a read-only Git submodule. |

The product name is **Nori-Agent**. Package names retain Rein / ReinProtocol prefixes for compatibility, including the root package `rein-agent` and the `@rein-protocol/*` scope. Existing plugin paths, `rein_*` tools, environment variables, `foundationDb` configuration, and avatar paths remain compatible.

## Contributing

Implement Nori functionality through plugins and the documented OpenClaw SDK. Keep `vendor/openclaw` unchanged. Connect each implementation to a PRD requirement, user story, or acceptance criterion, and distinguish proposed behavior from implemented behavior.

Read the [contribution guide](CONTRIBUTING.md) before making changes. Never commit credentials or real organization records. Example policies do not authorize live operations.

**License:** A license has not yet been selected; no open-source license is currently granted.
