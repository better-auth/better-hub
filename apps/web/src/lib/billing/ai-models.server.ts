import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIModelId } from "./ai-models";
import { getUserSettings } from "../user-settings-store";

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
