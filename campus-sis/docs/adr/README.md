# Architecture Decision Records (ADRs)

Lock decisions here as they're made. One file per decision: `NNNN-short-title.md`.

Suggested template:

```
# NNNN — <Title>

- **Status:** proposed | accepted | superseded by NNNN
- **Date:** YYYY-MM-DD
- **Context:** what forces the decision
- **Decision:** what we chose
- **Consequences:** trade-offs, follow-ups
```

## Logged decisions

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](0001-backend-stack.md) | Backend stack: NestJS + TypeScript | Accepted |
| [0002](0002-persistence-and-rls.md) | PostgreSQL + Drizzle + SQL-first RLS migrations | Accepted |
| [0003](0003-hosting.md) | Hosting: Render/Railway to start, residency-ready later | Accepted |
| [0004](0004-first-payment-gateway.md) | First payment gateway: Flutterwave | Accepted |

Open decisions awaiting an ADR are tracked in [`../08-open-questions.md`](../08-open-questions.md).
