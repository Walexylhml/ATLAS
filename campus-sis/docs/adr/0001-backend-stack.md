# ADR-0001 — Backend stack: NestJS + TypeScript

- **Status:** Accepted (2026-10-20)
- **Deciders:** Whale, Claude
- **Resolves:** Q-ARCH-1

## Decision

The ATLAS Core is a **modular monolith** written in **TypeScript on Node.js**, using
**NestJS** as the application framework.

## Context

Three candidates were weighed: TypeScript/Node (NestJS), Python (Django/FastAPI), and
Kotlin/Java (Spring). Decision factors (per `06-architecture.md`): founder/team fluency,
hiring pool, and productivity for a two-person team, biased toward boring and proven.

## Rationale

- **One language end to end.** The client is a React PWA; TypeScript across API and client
  means shared types, shared validators (Zod), and no context-switch tax for a tiny team.
- **Hiring pool.** The Lagos / African developer market skews heavily to JavaScript/TypeScript,
  especially in fintech — the pool we hire the first engineer from (Q-OPS-1).
- **NestJS gives monolith structure.** Modules, providers and clear boundaries map directly to
  the domain modules in the architecture, and a module can later be extracted into its own
  service with minimal churn — which matters because **we plan to scale out after MVP**.
- **Correctness cores stay pure.** The CGPA engine and the financial ledger are plain, heavily
  tested TypeScript modules with explicit invariants; the framework stays out of their way.

## Consequences

- We accept Node's single-threaded CPU profile; the correctness-critical heavy compute
  (bulk results, reconciliation) runs in the worker/queue tier, not the request path.
- Strictness is enforced: `strict` TS, `noUncheckedIndexedAccess`, lint + typecheck gate CI.
- **Scale path (post-MVP):** keep module boundaries clean so results-compute and notifications
  can be split into separate services first, exactly as the architecture anticipates. No
  microservices up front.
