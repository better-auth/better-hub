// Centralised AI model registry — single source of truth for pricing + UI metadata.

interface ModelPricing {
	inputPerM: number;
	outputPerM: number;
	cacheReadMultiplier?: number;
	cacheWriteMultiplier?: number;
}

interface ModelDef {
	label: string;
	desc: string;
	pricing: ModelPricing;
}

const AI_MODELS = {
	//
	// OpenRouter models
	//
	"moonshotai/kimi-k2.5": {
		label: "Kimi K2.5",
		desc: "Moonshot AI",
		pricing: { inputPerM: 0.45, outputPerM: 2.2 },
	},
	"anthropic/claude-sonnet-4": {
		label: "Claude Sonnet 4",
		desc: "Anthropic",
		pricing: { inputPerM: 3, outputPerM: 15 },
	},
	"anthropic/claude-opus-4": {
		label: "Claude Opus 4",
		desc: "Anthropic",
		pricing: { inputPerM: 15, outputPerM: 75 },
	},
	"openai/gpt-4.1": {
		label: "GPT-4.1",
		desc: "OpenAI",
		pricing: { inputPerM: 2, outputPerM: 8 },
	},
	"openai/o3-mini": {
		label: "o3-mini",
		desc: "OpenAI",
		pricing: { inputPerM: 1.1, outputPerM: 4.4 },
	},
	"google/gemini-2.5-pro-preview": {
		label: "Gemini 2.5 Pro",
		desc: "Google",
		pricing: { inputPerM: 1.25, outputPerM: 10 },
	},
	"google/gemini-2.5-flash": {
		label: "Gemini 2.5 Flash",
		desc: "Google",
		pricing: { inputPerM: 0.3, outputPerM: 2.5 },
	},
	"deepseek/deepseek-chat-v3.1": {
		label: "DeepSeek V3.1",
		desc: "DeepSeek",
		pricing: { inputPerM: 0.15, outputPerM: 0.75 },
	},
	"meta-llama/llama-4-maverick": {
		label: "Llama 4 Maverick",
		desc: "Meta",
		pricing: { inputPerM: 0.15, outputPerM: 0.6 },
	},
	//
	// Anthropic models (direct)
	//
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
