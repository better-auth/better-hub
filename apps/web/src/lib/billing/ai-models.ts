// Centralised AI model registry — single source of truth for pricing + UI metadata.

import { OPENROUTER_MODELS } from "./openrouter-models.generated";

export interface ModelPricing {
	inputPerM: number;
	outputPerM: number;
	cacheReadMultiplier?: number;
	cacheWriteMultiplier?: number;
}

export interface ModelDef {
	label: string;
	desc: string;
	pricing: ModelPricing;
}

// Anthropic models called directly (not via OpenRouter)
const DIRECT_MODELS = {
	"claude-haiku-4-5-20251001": {
		label: "Claude Haiku",
		desc: "Anthropic",
		pricing: {
			inputPerM: 1,
			outputPerM: 5,
			cacheReadMultiplier: 0.1,
			cacheWriteMultiplier: 1.25,
		},
	},
} as const satisfies Record<string, ModelDef>;

const AI_MODELS = {
	...OPENROUTER_MODELS,
	...DIRECT_MODELS,
} as const satisfies Record<string, ModelDef>;

export type AIModelId = keyof typeof AI_MODELS;

// ─── UI helpers ──────────────────────────────────────────────────────────────

// User-selectable models exposed in settings & command palette (haiku excluded).
export const SELECTABLE_MODELS: readonly { id: AIModelId; label: string; desc: string }[] = (
	Object.keys(AI_MODELS) as AIModelId[]
)
	.filter((id) => !id.startsWith("claude-"))
	.map((id) => ({ id, label: AI_MODELS[id].label, desc: AI_MODELS[id].desc }));

// ─── Pricing helpers ─────────────────────────────────────────────────────────

export type PricedModelId = AIModelId;

export interface UsageDetails {
	input: number;
	output: number;
	cacheRead?: number;
	cacheWrite?: number;
	reasoning?: number;
	total: number;
}

export interface CostDetails {
	input: number;
	output: number;
	cacheRead?: number;
	cacheWrite?: number;
	total: number;
}

export function hasModelPricing(model: string): model is PricedModelId {
	return model in AI_MODELS;
}

export function calculateCostUsd(model: PricedModelId, usage: UsageDetails): CostDetails {
	const pricing: ModelPricing = AI_MODELS[model].pricing;

	const inputCost = (usage.input * pricing.inputPerM) / 1_000_000;
	const outputCost = (usage.output * pricing.outputPerM) / 1_000_000;

	const cacheReadCost =
		pricing.cacheReadMultiplier && usage.cacheRead
			? (usage.cacheRead * pricing.inputPerM * pricing.cacheReadMultiplier) /
				1_000_000
			: 0;

	const cacheWriteCost =
		pricing.cacheWriteMultiplier && usage.cacheWrite
			? (usage.cacheWrite * pricing.inputPerM * pricing.cacheWriteMultiplier) /
				1_000_000
			: 0;

	const total = inputCost + outputCost + cacheReadCost + cacheWriteCost;

	const details: CostDetails = {
		input: inputCost,
		output: outputCost,
		total,
	};
	if (cacheReadCost > 0) details.cacheRead = cacheReadCost;
	if (cacheWriteCost > 0) details.cacheWrite = cacheWriteCost;

	return details;
}
