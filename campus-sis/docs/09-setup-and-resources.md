# 09 — Setup & Resources (what we need to run ATLAS)

The holistic provisioning checklist: every account, service and secret needed to run ATLAS
from a laptop through to the pilot deployment. Locked stack decisions are in
[`adr/`](adr/); this doc is the operational "what to open and plug in" list.

> **Stack locked (2026-10-20):** NestJS + TypeScript · PostgreSQL + RLS · Render/Railway ·
> Flutterwave (first payment adapter) · React PWA (client, later phase).

---

## 1. Accounts to open

| # | Service | Purpose | Tier to start | Who | When |
|---|---------|---------|---------------|-----|------|
| 1 | **GitHub** | Source, CI, PR review | Free (done — repo exists) | Whale | ✅ now |
| 2 | **Render** (or Railway) | Managed Postgres + API web service + outbox worker | Starter / Basic-256MB | Whale | Phase 0 |
| 3 | **Flutterwave** | Payment rail — fees, reconciliation. Create app, get **TEST** keys first | Test keys free | Whale | Phase 1 |
| 4 | **Object storage (S3-compatible)** | Documents, photos, receipts, transcripts. **Cloudflare R2** (no egress fee) or Backblaze B2 | R2 free tier | Whale | Phase 0–1 |
| 5 | **SMS aggregator** | OTP + fee/registration notifications; the primary channel for the market. Options: Termii, Africa's Talking, or a Flutterwave-adjacent SMS | Pay-as-you-go | Whale | Phase 1 (Q-ARCH-6) |
| 6 | **Email sender** | Transactional email fallback. Resend or Postmark | Free tier | Whale | Phase 1 |
| 7 | **Error tracking** | Sentry — crash + error visibility from day one | Free dev tier | Claude can wire | Phase 0 |
| 8 | **Domain + DNS** | `atlas.africa` (or chosen name) for the PWA + tenant subdomains (`<school>.atlas.africa`). Cloudflare DNS | ~$10–40/yr | Whale | Phase 0–1 |
| 9 | **Uptime / status** | Basic uptime ping on `/healthz` (Render has built-in; UptimeRobot free otherwise) | Free | Claude can wire | Phase 1 |

Nothing above needs a company entity to start (Q-OPS-2 can stay open); personal accounts are
fine for the pilot, migrated to a company org later.

## 2. The three resources that are code-ready now (Phase 0)

These are already wired in the repo — you only supply the account + secret:

- **PostgreSQL** — schema, RLS tenant isolation, migrations, seed all exist. On Render the
  `render.yaml` blueprint creates the database and injects `DATABASE_URL` automatically.
- **API web service** — NestJS app; `render.yaml` builds it and runs migrations on deploy.
- **Outbox worker** — separate Render worker; relays `event_outbox` to downstream handlers.

One click on the Render Blueprint (point it at this repo, `rootDir: campus-sis`) stands up all
three. Object storage, Sentry and payments plug in as their secrets land.

## 3. Secrets / environment variables

Full template: [`.env.example`](../.env.example). Summary of what each environment needs:

| Variable | Local dev | Render | Notes |
|---|---|---|---|
| `DATABASE_URL` | docker-compose default | auto from DB | app connects as a non-owner role in prod |
| `JWT_SECRET` | dummy in `.env` | `generateValue: true` | real auth lands with the auth module |
| `FLW_SECRET_KEY` / `FLW_WEBHOOK_SECRET_HASH` | Flutterwave **test** keys | dashboard secret (`sync:false`) | never commit; webhook hash verifies callbacks |
| `STORAGE_*` | optional until used | R2/B2 creds | documents module |
| `SMS_API_KEY` / `EMAIL_API_KEY` | optional | provider secret | notifications module |
| `SENTRY_DSN` | optional | dashboard secret | observability |

**Rule:** no real secret ever enters git. `.env` is git-ignored; production secrets live in the
Render dashboard. Flutterwave **test** keys only until a pilot is live.

## 4. Rough monthly cost (pilot scale)

| Item | Est. /mo |
|---|---|
| Render Postgres (basic) + web + worker (starter) | ~$20–35 |
| Cloudflare R2 (documents, light) | ~$0–5 |
| SMS (OTP + notices, usage-based) | varies with volume — the main variable cost |
| Email (free tier) | $0 |
| Sentry / uptime (free tiers) | $0 |
| Domain | ~$1–3 amortised |

Pilot infrastructure is roughly **$25–45/mo + SMS usage** — SMS is the cost to watch, which is
why notification channel fallbacks (push/email before SMS) are an architectural concern.

## 5. Local developer setup (works today)

```bash
cd campus-sis
pnpm install
cp .env.example .env            # defaults match docker-compose
pnpm db:up                      # start local Postgres
pnpm db:migrate                 # create schema + RLS policies
pnpm db:seed                    # plan, platform admin, demo tenant + admin
pnpm dev                        # API on http://localhost:3000  (GET /healthz)
pnpm --filter @atlas/api test   # unit + RLS tenant-isolation tests
```

## 6. Division of labour

- **Claude builds:** all application code, schema/migrations, CI, IaC (`render.yaml`),
  integration adapters, tests. Opens PRs on GitHub for Whale to review and merge.
- **Whale does (needs a human / a card / an identity):** open the accounts in §1, paste
  provider secrets into Render, point the Render Blueprint at the repo, buy the domain, and
  approve/merge PRs. These are the Prohibited-for-an-agent actions (credentials, payments,
  account creation) — they stay with you.

## 7. Still open (don't block Phase 0)

- Pilot institution (Q-GTM-2) → shapes first config + which SMS/payment rail.
- In-Nigeria data residency timing (Q-ARCH-2) → Render now, dedicated in-country tier later;
  the data model already supports per-tenant placement.
- JAMB/CAPS integration mechanism (Q-ARCH-4) → Phase 3; verify what JAMB exposes.
- SMS aggregator choice (Q-ARCH-6) → needed for Phase 1 notifications/OTP.
