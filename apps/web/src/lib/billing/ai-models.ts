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

const AI_MODELS = OPENROUTER_MODELS;

export type AIModelId = keyof typeof AI_MODELS;

// ─── UI helpers ──────────────────────────────────────────────────────────────

// User-selectable models exposed in settings & command palette (haiku excluded).
export const SELECTABLE_MODELS: readonly { id: AIModelId; label: string; desc: string }[] = (
	Object.keys(AI_MODELS) as AIModelId[]
)
	.filter((id) => id !== "anthropic/claude-haiku-4.5")
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

	// usage.input = prompt_tokens = noCache + cacheRead (cacheWrite is separate).
	// Subtract only cacheRead to avoid double-charging it at full rate.
	const cacheRead = usage.cacheRead ?? 0;
	const cacheWrite = usage.cacheWrite ?? 0;
	const nonCacheInput = Math.max(0, usage.input - cacheRead);

	const inputCost = (nonCacheInput * pricing.inputPerM) / 1_000_000;
	const outputCost = (usage.output * pricing.outputPerM) / 1_000_000;

	const cacheReadCost =
		pricing.cacheReadMultiplier && cacheRead > 0
			? (cacheRead * pricing.inputPerM * pricing.cacheReadMultiplier) / 1_000_000
			: 0;

	const cacheWriteCost =
		pricing.cacheWriteMultiplier && cacheWrite > 0
			? (cacheWrite * pricing.inputPerM * pricing.cacheWriteMultiplier) /
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
