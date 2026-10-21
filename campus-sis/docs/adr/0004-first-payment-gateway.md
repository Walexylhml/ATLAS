# ADR-0004 — First payment gateway: Flutterwave

- **Status:** Accepted (2026-10-20)
- **Deciders:** Whale
- **Resolves:** Q-ARCH-5 (first adapter); Q-ARCH-5 stays open for the pilot's actual rail

## Decision

Build the **reference `PaymentGateway` adapter against Flutterwave** first. The gateway stays
an interface (architecture §5) with adapters for Remita, Paystack and Interswitch added as
pilot institutions require.

## Rationale

- Founder has deep, inside knowledge of the Flutterwave rail — a real speed advantage on edge
  cases, settlement behaviour, and support that matters for the correctness-critical money path.
- One concrete adapter proves the interface shape, the signed-webhook + reconciliation-polling
  pattern, and idempotent posting to the ledger. The second adapter is then cheap.

## Consequences

- The pilot institution's existing rail may differ (often Remita for federal/state schools).
  Because `PaymentGateway` is an interface, adding that adapter is additive, not a rewrite —
  so this decision does not constrain Q-GTM-2 / Q-ARCH-5's pilot-rail choice.
- Integration uses **test keys** until a pilot is live; webhook signatures verified via
  `FLW_WEBHOOK_SECRET_HASH`; every gateway event posts idempotently to the append-only ledger.
