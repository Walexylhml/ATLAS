# 08 — Open Questions & Decision Queue

Live decisions, newest-priority at the top. Resolve top-down. When a decision is made, record
it as an ADR in `docs/adr/` and update the relevant doc.

> Format: **[ID] Question — options — owner — status**

## Product & go-to-market

- **[Q-GTM-1] Beachhead segment.** You said "everyone," and the *platform* is built for
  everyone — but the first *deployment* needs one design-partner institution. Options: a
  private university (fastest to close, cleanest), a single federal/state uni pilot (slow,
  huge credibility), or a polytechnic/COE (underserved, volume). **Recommendation: one
  private university as design partner for Phases 0–2, then broaden.** — _Whale_ — **open**
- **[Q-GTM-2] First pilot institution.** Do you have a specific school/relationship to anchor
  the pilot? This shapes config priorities. — _Whale_ — **open**
- **[Q-GTM-3] Pricing model.** Per-student/year? Per-module? Transaction fee on payments
  (fintech-style)? A payment take-rate could subsidise the SaaS. — _Whale_ — **open**
- **[Q-GTM-4] Relationship to Odu EMR.** Shared tenancy/identity/config/payments
  infrastructure between ATLAS and Odu? Decide early if the two should share a platform core.
  — _Whale_ — **open**

## Architecture & tech

- **[Q-ARCH-1] Backend language/framework.** ~~TypeScript/Node (NestJS), Python
  (Django/FastAPI), or Java/Kotlin (Spring)?~~ **RESOLVED → NestJS + TypeScript. See
  [ADR-0001](adr/0001-backend-stack.md).** — _Whale/Claude_ — **✅ closed**
- **[Q-ARCH-2] Hosting & data residency.** ~~Which provider/region?~~ **RESOLVED (partially)
  → Render/Railway to start; in-country residency deferred to the dedicated tier. See
  [ADR-0003](adr/0003-hosting.md).** Residency timing for a specific flagship tenant stays
  open. — _Whale_ — **✅ mostly closed**
- **[Q-ARCH-3] PWA framework.** React vs Svelte vs other, under the low-end-Android
  performance budget. — _Claude_ — **open**
- **[Q-ARCH-4] JAMB/CAPS integration mechanism.** File import vs API — what does JAMB
  actually expose to institutions today? Needs verification. — _Whale_ — **open**
- **[Q-ARCH-5] First payment gateway.** **Reference adapter RESOLVED → Flutterwave (founder's
  rail). See [ADR-0004](adr/0004-first-payment-gateway.md).** The pilot institution's *actual*
  rail (often Remita for federal/state) stays open and is additive via the `PaymentGateway`
  interface. — _Whale_ — **◐ partially closed**
- **[Q-ARCH-6] SMS aggregator(s).** For reliable notifications/USSD fallback. — _Whale_ —
  **open**

## Product scope specifics

- **[Q-SCOPE-1] Postgraduate handling depth** in the initial model (PG has different
  structures — thesis, supervisors). In the data model but low priority — confirm. — **open**
- **[Q-SCOPE-2] Polytechnic/COE specifics** (ND/HND 4.0 scale, NCE) — confirm they're
  Phase-later vs needed for the pilot. — **open**
- **[Q-SCOPE-3] Parent academic visibility policy** default — off unless student+institution
  consent? Confirm the NDPA-safe default. — **open**
- **[Q-SCOPE-4] Health services module** — include at all, given NDPA sensitivity? Default:
  opt-in, later phase. — **open**

## Operating model

- **[Q-OPS-1] Team growth.** It's you + Claude now. When/what is the first human hire
  (likely a strong engineer)? Mo's involvement here vs Dola? — _Whale_ — **open**
- **[Q-OPS-2] Entity/branding.** ATLAS as a standalone product/company, or under an existing
  umbrella? — _Whale_ — **open**

## Resolved decisions (move here as they're locked)

- **[D-1] Product name:** ATLAS — Academic Tracking, Learning, and Achievement System. ✅
- **[D-2] Primary database:** PostgreSQL (RLS multi-tenancy, strong integrity). ✅ (strong
  recommendation; confirm at ADR)
- **[D-3] Architecture style:** modular monolith, multi-tenant, config-driven, API-first. ✅
  (recommendation)
- **[D-4] Delivery shape:** full-SIS architecture, phased delivery; MVP = Phase 0 + Phase 1
  (fees + registration). ✅
- **[D-5] Backend stack:** NestJS + TypeScript, modular monolith. [ADR-0001](adr/0001-backend-stack.md). ✅
- **[D-6] Persistence:** PostgreSQL + Drizzle; SQL-first migrations with RLS enforcing tenant
  isolation. [ADR-0002](adr/0002-persistence-and-rls.md). ✅
- **[D-7] Hosting:** Render/Railway for the pilot; residency-ready for a later dedicated tier.
  [ADR-0003](adr/0003-hosting.md). ✅
- **[D-8] First payment adapter:** Flutterwave. [ADR-0004](adr/0004-first-payment-gateway.md). ✅
