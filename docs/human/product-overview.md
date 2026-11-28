# 🧩 Capabilities and implementation status

[中文](product-overview-zh.md)

## Capabilities

Nori-Agent is designed around four areas of organizational work:

| Area | Product goal |
| --- | --- |
| Daily operations and decisions | Triage requests, prepare meetings, follow up on tasks, and resolve routine matters under authorized policies. |
| Financial resource coordination | Assess resource needs, support budget decisions, and track allocations and commitments. |
| People coordination | Support members, staff, and volunteers through onboarding, responsibilities, and contribution tracking. |
| Community maintenance | Guide newcomers, help people discover resources and events, and support participation and feedback. |

The broader product direction also considers fundraising and donor relations, program delivery, impact evaluation, governance and compliance, protection and participation of people served, and external communications and partnerships. These remain **proposals for discussion**, rather than confirmed first-release commitments. See the [product requirements](../agent/requirements/PRD-agent-community-operations.md).

## Current status

**The project has a local business core, development rehearsals, and limited live acceptance evidence. The full product scope is still in development.**

| Component | Available implementation | Current boundary |
| --- | --- | --- |
| Proposals and governance | Identity binding, proposal collection and submission, Board voting, result records, and funds snapshots through an authenticated backend. | Requires explicit backend, workspace, and channel configuration. A vote result does not execute a payment. |
| Community support | Discord onboarding guidance and authenticated resource and event discovery. | Requires configured services and verified community access. Limited live acceptance does not establish general readiness. |
| Session and memory isolation | Shared primitives and historical synthetic probes; Slack adapter retained for compatibility. | Discord replacement withdrawn; native guild sessions remain shared. See the [replacement design](../agent/requirements/discord-isolation-redesign.md). |
| Model routing | Optional Magpie gateway, manual model selection, and Jev dynamic routing. | Provider access and billing compatibility require operator verification. |
| Browser tasks | Pinned agent-browser integration with an encrypted credential vault and session reuse. | Runs within operator authorization and existing channel permissions. |

The initial governance workflow is:

**Verified identity → proposal → Board vote → recorded result**, with funds snapshots available to authorized directors.

Real payments, fund reservations, automatic role grants, and the full activity-to-publication workflow are not enabled. The Agent accesses organizational data through the backend API and holds no database credentials.

For dated evidence and outstanding checks, read the [implementation record](../agent/verification/implementation-and-deployment.md), [acceptance evidence](../agent/verification/acceptance-evidence.md), and [roadmap](../agent/verification/roadmap.md).
