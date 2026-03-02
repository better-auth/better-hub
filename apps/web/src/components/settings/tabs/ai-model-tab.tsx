"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserSettings } from "@/lib/user-settings-store";
import { SELECTABLE_MODELS } from "@/lib/billing/ai-models";

interface AIModelTabProps {
	settings: UserSettings;
	onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
}

const MODELS = [
	{ id: "auto" as const, label: "Auto", desc: "Best model for the task — Default" },
	...SELECTABLE_MODELS,
];

export function AIModelTab({ settings, onUpdate }: AIModelTabProps) {
	const [customModel, setCustomModel] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

	const [openaiUrl, setOpenaiUrl] = useState("");
	const [openaiKey, setOpenaiKey] = useState("");
	const [openaiTesting, setOpenaiTesting] = useState(false);
	const [openaiTestResult, setOpenaiTestResult] = useState<"success" | "error" | null>(null);

	const isCustom = !MODELS.some((m) => m.id === settings.ghostModel);

	async function testApiKey() {
		if (!apiKey.trim()) return;
		setTesting(true);
		setTestResult(null);
		try {
			const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
				headers: { Authorization: `Bearer ${apiKey.trim()}` },
			});
			setTestResult(res.ok ? "success" : "error");
		} catch {
			setTestResult("error");
		} finally {
			setTesting(false);
		}
	}

	async function testOpenaiKey() {
		if (!openaiUrl.trim() && !settings.openaiApiUrl) return;
		if (!openaiKey.trim() && !settings.openaiApiKey) return;
		setOpenaiTesting(true);
		setOpenaiTestResult(null);
		try {
			const baseUrl = openaiUrl.trim() || settings.openaiApiUrl || "";
			const key = openaiKey.trim();
			const url = baseUrl.replace(/\/+$/, "") + "/models";
			const res = await fetch(url, {
				headers: key ? { Authorization: `Bearer ${key}` } : {},
			});
			setOpenaiTestResult(res.ok ? "success" : "error");
		} catch {
			setOpenaiTestResult("error");
		} finally {
			setOpenaiTesting(false);
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
					<div className="space-y-4">
						<div>
							<div className="flex gap-2">
								<input
									type="password"
									value={apiKey}
									onChange={(e) => {
										setApiKey(
											e.target
												.value,
										);
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
											await onUpdate(
												{
													openrouterApiKey:
														apiKey.trim(),
												},
											);
										}
									}}
									className="border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
								>
									Save
								</button>
								<button
									onClick={testApiKey}
									disabled={
										testing ||
										!apiKey.trim()
									}
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
									Invalid key or request
									failed.
								</p>
							)}
						</div>

						{/* Custom model — only relevant with own key */}
						<div className="pt-3 border-t border-border">
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
										setCustomModel(
											e.target
												.value,
										)
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
				)}
			</div>

			{/* OpenAI-Compatible API */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					OpenAI-Compatible API
				</label>
				<p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5 mb-3">
					Connect your own OpenAI-compatible endpoint (e.g. Azure
					OpenAI, local LLMs, etc). When configured, this overrides
					OpenRouter.
				</p>

				<div className="space-y-2">
					<div>
						<label className="text-[10px] text-muted-foreground/50 font-mono">
							Base URL
						</label>
						<input
							type="text"
							value={openaiUrl}
							onChange={(e) => {
								setOpenaiUrl(e.target.value);
								setOpenaiTestResult(null);
							}}
							placeholder={
								settings.openaiApiUrl
									? `Current: ${settings.openaiApiUrl}`
									: "https://api.openai.com/v1"
							}
							className="w-full max-w-sm bg-transparent border border-border px-3 py-1.5 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md mt-1"
						/>
					</div>
					<div>
						<label className="text-[10px] text-muted-foreground/50 font-mono">
							API Key
						</label>
						<input
							type="password"
							value={openaiKey}
							onChange={(e) => {
								setOpenaiKey(e.target.value);
								setOpenaiTestResult(null);
							}}
							placeholder={
								settings.openaiApiKey
									? `Current: ${settings.openaiApiKey}`
									: "sk-..."
							}
							className="w-full max-w-sm bg-transparent border border-border px-3 py-1.5 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md mt-1"
						/>
					</div>
					<div className="flex gap-2 pt-1">
						<button
							onClick={async () => {
								const updates: Partial<UserSettings> =
									{};
								if (openaiUrl.trim())
									updates.openaiApiUrl =
										openaiUrl.trim();
								if (openaiKey.trim())
									updates.openaiApiKey =
										openaiKey.trim();
								if (
									Object.keys(updates)
										.length > 0
								) {
									await onUpdate(updates);
								}
							}}
							className="border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
						>
							Save
						</button>
						<button
							onClick={testOpenaiKey}
							disabled={
								openaiTesting ||
								(!openaiUrl.trim() &&
									!settings.openaiApiUrl)
							}
							className="border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
						>
							{openaiTesting ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								"Test"
							)}
						</button>
						{(settings.openaiApiUrl ||
							settings.openaiApiKey) && (
							<button
								onClick={async () => {
									await onUpdate({
										openaiApiUrl: null,
										openaiApiKey: null,
									});
									setOpenaiUrl("");
									setOpenaiKey("");
									setOpenaiTestResult(null);
								}}
								className="border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-destructive/70 hover:text-destructive hover:bg-destructive/5 transition-colors cursor-pointer"
							>
								Clear
							</button>
						)}
					</div>
					{openaiTestResult === "success" && (
						<p className="text-[10px] font-mono text-green-500">
							Connection successful.
						</p>
					)}
					{openaiTestResult === "error" && (
						<p className="text-[10px] font-mono text-destructive">
							Connection failed. Check URL and key.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
