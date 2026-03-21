# Billing System

Better Hub uses Stripe for metered billing of AI usage. Users receive welcome credits and can set spending limits. The system tracks every AI call with token-level granularity.

## Key Files

- `apps/web/src/lib/billing/config.ts` -- Constants: error codes, welcome credit amount, cost-to-units ratio, Stripe config
- `apps/web/src/lib/billing/ai-models.ts` -- AI model registry with pricing per million tokens
- `apps/web/src/lib/billing/ai-models.server.ts` -- Server-side model helpers
- `apps/web/src/lib/billing/openrouter-models.generated.ts` -- Auto-generated model catalog (from `scripts/generate-openrouter-models.mts`)
- `apps/web/src/lib/billing/credit.ts` -- Credit ledger operations (grant, check balance)
- `apps/web/src/lib/billing/spending-limit.ts` -- Per-user spending limit management
- `apps/web/src/lib/billing/stripe.ts` -- Stripe client, metered usage reporting
- `apps/web/src/lib/billing/token-usage.ts` -- Token usage logging and cost calculation
- `apps/web/src/lib/billing/usage-limit.ts` -- Pre-request usage limit checks
- `apps/web/src/lib/inngest.ts` -- Background job: `retryUnreportedUsage` (cron every 10 min)
- `apps/web/src/app/api/billing/balance/route.ts` -- Credit balance endpoint
- `apps/web/src/app/api/billing/spending-limit/route.ts` -- Spending limit CRUD
- `apps/web/src/app/api/billing/welcome/route.ts` -- Welcome credit grant

## Billing Flow

```
AI Request
    │
    ├── checkUsageLimit(userId)
    │   ├── Check credit balance (credit_ledger, minus usage_logs)
    │   ├── Check spending limit (spending_limit table)
    │   └── Return: { allowed, creditExhausted?, spendingLimitReached? }
    │
    ├── If not allowed → return BILLING_ERROR code
    │   ├── MESSAGE_LIMIT_REACHED
    │   ├── CREDIT_EXHAUSTED
    │   └── SPENDING_LIMIT_REACHED
    │
    ▼ (request proceeds)
    │
    ├── AI model processes request
    │
    ▼ (response complete)
    │
    ├── logTokenUsage(userId, model, usage)
    │   ├── Calculate cost via calculateCostUsd()
    │   ├── Insert ai_call_logs record
    │   ├── Insert usage_logs record
    │   └── Deduct from credits if applicable
    │
    └── reportUsageToStripe(usageLogId, userId, costUsd)
        ├── Convert cost to units (1 USD = 10,000 units)
        └── Report to Stripe Meter API
```

## Credit System

### Welcome Credits
- New users receive **$10.00 USD** in credits upon signup
- Credits expire after **30 days**
- Granted via `grantSignupCredits()` called from the Stripe `onCustomerCreate` hook

### Credit Ledger
The `credit_ledger` table tracks all credit transactions:
- `amount` -- Credit amount (positive = grant, negative = usage)
- `type` -- Transaction type (e.g., `welcome_credit`)
- `expiresAt` -- Optional expiration date

### Balance Calculation
Available balance = sum of non-expired credits minus sum of usage costs.

## AI Model Pricing

Models are registered in `ai-models.ts` with pricing per million tokens:

```typescript
interface ModelPricing {
  inputPerM: number;      // Cost per 1M input tokens
  outputPerM: number;     // Cost per 1M output tokens
  cacheReadMultiplier?: number;   // Discount for cache reads (e.g., 0.1 = 90% off)
  cacheWriteMultiplier?: number;  // Premium for cache writes
}
```

Cost calculation handles:
- Standard input/output token costs
- Cache read discounts (subtract cache reads from input, apply multiplier)
- Cache write premiums

The model catalog is auto-generated from the OpenRouter API via `scripts/generate-openrouter-models.mts`. Run `bun generate:models` to refresh.

## Stripe Integration

### Metered Billing
- 1 USD = 10,000 Stripe meter units (`COST_TO_UNITS`)
- The Stripe meter price must be set to $0.0001 per unit
- Usage is reported per AI call via `reportUsageToStripe()`

### Subscription
- Plan: `base` with a metered line item
- Active statuses: `active`, `trialing`
- Configured via `STRIPE_BASE_PRICE_ID` and `STRIPE_METERED_PRICE_ID` env vars

### Stripe is Optional
Stripe features are disabled when `STRIPE_SECRET_KEY` is not set. A console warning is logged. This allows local development without Stripe.

## Spending Limits

Users can set a monthly spending cap via the settings UI:
- Stored in the `spending_limit` table (`monthlyCapUsd`, default $10.00)
- Minimum cap: $0.01
- Checked before each AI request in `checkUsageLimit()`

## Failure Recovery

The `retryUnreportedUsage` Inngest function runs every 10 minutes:

1. **Expire old entries**: Usage logs older than 35 days (Stripe meter API limit) that were never reported are marked as reported and logged as permanent loss
2. **Retry pending entries**: Unreported usage logs (at least 1 minute old) are retried in batches of 25
3. This ensures no revenue leakage from transient Stripe API failures

## Database Tables

| Table | Purpose |
|---|---|
| `ai_call_logs` | Per-call token usage, model, provider, cost |
| `usage_logs` | Billing usage records, links to ai_call_logs, Stripe report status |
| `credit_ledger` | Credit grants and expirations |
| `spending_limit` | Per-user monthly spending cap |
| `subscription` | Stripe subscription state |
