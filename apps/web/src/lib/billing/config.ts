// ── Error Codes ──

export const BILLING_ERROR = {
	MESSAGE_LIMIT_REACHED: "MESSAGE_LIMIT_REACHED",
	CREDIT_EXHAUSTED: "CREDIT_EXHAUSTED",
	SPENDING_LIMIT_REACHED: "SPENDING_LIMIT_REACHED",
} as const;

export type BillingErrorCode = (typeof BILLING_ERROR)[keyof typeof BILLING_ERROR];

export function getBillingErrorCode(result: {
	creditExhausted?: boolean;
	spendingLimitReached?: boolean;
}): BillingErrorCode {
	if (result.creditExhausted) return BILLING_ERROR.CREDIT_EXHAUSTED;
	if (result.spendingLimitReached) return BILLING_ERROR.SPENDING_LIMIT_REACHED;
	return BILLING_ERROR.MESSAGE_LIMIT_REACHED;
}

// ── Welcome Credit ──

export const WELCOME_CREDIT_TYPE = "welcome_credit";
export const WELCOME_CREDIT_USD = 10;
export const WELCOME_CREDIT_EXPIRY_DAYS = 30;

// ── Spending Limit ──

export const MIN_CAP_USD = 0.01;

// ── Stripe ──

export const COST_TO_UNITS = 10_000;
export const STRIPE_MAX_EVENT_AGE_DAYS = 35;

// ── Subscription ──

export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;
