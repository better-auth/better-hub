// Centralised AI model registry — single source of truth for pricing + UI metadata.

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { OPENROUTER_MODELS } from "./openrouter-models.generated";
import { getUserSettings } from "../user-settings-store";

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

// ─── Internal model helper ──────────────────────────────────────────────────

const INTERNAL_MODEL_ID: AIModelId = "anthropic/claude-haiku-4.5";

export async function getInternalModel(userId: string) {
	const settings = await getUserSettings(userId);
	const isCustomApiKey = !!(settings.useOwnApiKey && settings.openrouterApiKey);
	const apiKey = isCustomApiKey
		? settings.openrouterApiKey
		: (process.env.OPEN_ROUTER_API_KEY ?? "");

	if (!apiKey) {
		throw new Error("No OpenRouter API key configured.");
	}

	return {
		model: createOpenRouter({ apiKey })(INTERNAL_MODEL_ID),
		modelId: INTERNAL_MODEL_ID,
		isCustomApiKey,
	} as const;
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
