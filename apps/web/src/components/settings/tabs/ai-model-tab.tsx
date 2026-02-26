"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserSettings } from "@/lib/user-settings-store";

interface AIModelTabProps {
	settings: UserSettings;
	onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
}

const MODELS = [
	{ id: "auto", label: "Auto", desc: "Best model for the task — Default" },
	{ id: "moonshotai/kimi-k2.5", label: "Kimi K2.5", desc: "Moonshot AI" },
	{ id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", desc: "Anthropic" },
	{ id: "anthropic/claude-opus-4", label: "Claude Opus 4", desc: "Anthropic" },
	{ id: "openai/gpt-4.1", label: "GPT-4.1", desc: "OpenAI" },
	{ id: "openai/o3-mini", label: "o3-mini", desc: "OpenAI" },
	{ id: "google/gemini-2.5-pro-preview", label: "Gemini 2.5 Pro", desc: "Google" },
	{ id: "google/gemini-2.5-flash-preview", label: "Gemini 2.5 Flash", desc: "Google" },
	{ id: "deepseek/deepseek-chat-v3", label: "DeepSeek V3", desc: "DeepSeek" },
	{ id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", desc: "Meta" },
];

export function AIModelTab({ settings, onUpdate }: AIModelTabProps) {
	const [customModel, setCustomModel] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

	const isCustom = !MODELS.some((m) => m.id === settings.ghostModel);

	async function testApiKey() {
		if (!apiKey.trim()) return;
		setTesting(true);
		setTestResult(null);
		try {
			const res = await fetch("https://openrouter.ai/api/v1/models", {
				headers: { Authorization: `Bearer ${apiKey.trim()}` },
			});
			setTestResult(res.ok ? "success" : "error");
		} catch {
			setTestResult("error");
		} finally {
			setTesting(false);
		}
	}

	return (
		<div className="divide-y divide-border">
			{/* Model selector */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Ghost Model
				</label>
				<p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5 mb-3">
					Select the model used by the AI assistant.
				</p>

				<div className="space-y-1">
					{MODELS.map((model) => (
						<button
							key={model.id}
							onClick={() =>
								onUpdate({ ghostModel: model.id })
							}
							className={cn(
								"w-full flex items-center justify-between px-3 py-2 text-xs font-mono transition-colors cursor-pointer",
								settings.ghostModel === model.id
									? "bg-muted/50 dark:bg-white/[0.04] text-foreground"
									: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/30 dark:hover:bg-white/[0.02]",
							)}
						>
							<span>
								{model.label}
								<span className="text-muted-foreground ml-2">
									{model.desc}
								</span>
							</span>
							{settings.ghostModel === model.id && (
								<Check className="w-3 h-3 shrink-0" />
							)}
						</button>
					))}
				</div>

				{/* Custom model */}
				<div className="mt-3 pt-3 border-t border-border">
					<label className="text-[10px] text-muted-foreground/50 font-mono">
						Custom OpenRouter model ID
					</label>
					<div className="flex gap-2 mt-1.5">
						<input
							type="text"
							value={
								isCustom
									? settings.ghostModel
									: customModel
							}
							onChange={(e) =>
								setCustomModel(e.target.value)
							}
							placeholder="provider/model-name"
							className="flex-1 max-w-sm bg-transparent border border-border px-3 py-1.5 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
						/>
						<button
							onClick={() => {
								const val = (
									isCustom
										? settings.ghostModel
										: customModel
								).trim();
								if (val)
									onUpdate({
										ghostModel: val,
									});
							}}
							className="border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
						>
							Save
						</button>
					</div>
				</div>
			</div>

			{/* API Key */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					API Key
				</label>
				<p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5 mb-3">
					Use the app&apos;s shared key or bring your own OpenRouter
					key.
				</p>

				<div className="flex gap-2 mb-3">
					<button
						onClick={() => onUpdate({ useOwnApiKey: false })}
						className={cn(
							"border px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer",
							!settings.useOwnApiKey
								? "border-foreground/30 text-foreground bg-muted/50 dark:bg-white/[0.04]"
								: "border-border text-muted-foreground hover:text-foreground/60 hover:border-foreground/10",
						)}
					>
						App&apos;s key
					</button>
					<button
						onClick={() => onUpdate({ useOwnApiKey: true })}
						className={cn(
							"border px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer",
							settings.useOwnApiKey
								? "border-foreground/30 text-foreground bg-muted/50 dark:bg-white/[0.04]"
								: "border-border text-muted-foreground hover:text-foreground/60 hover:border-foreground/10",
						)}
					>
						Own key
					</button>
				</div>

				{settings.useOwnApiKey && (
					<div>
						<div className="flex gap-2">
							<input
								type="password"
								value={apiKey}
								onChange={(e) => {
									setApiKey(e.target.value);
									setTestResult(null);
								}}
								placeholder={
									settings.openrouterApiKey
										? `Current: ${settings.openrouterApiKey}`
										: "sk-or-..."
								}
								className="flex-1 max-w-sm bg-transparent border border-border px-3 py-1.5 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
							/>
							<button
								onClick={async () => {
									if (apiKey.trim()) {
										await onUpdate({
											openrouterApiKey:
												apiKey.trim(),
										});
									}
								}}
								className="border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
							>
								Save
							</button>
							<button
								onClick={testApiKey}
								disabled={testing || !apiKey.trim()}
								className="border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{testing ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : (
									"Test"
								)}
							</button>
						</div>
						{testResult === "success" && (
							<p className="mt-1.5 text-[10px] font-mono text-green-500">
								Key is valid.
							</p>
						)}
						{testResult === "error" && (
							<p className="mt-1.5 text-[10px] font-mono text-destructive">
								Invalid key or request failed.
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
