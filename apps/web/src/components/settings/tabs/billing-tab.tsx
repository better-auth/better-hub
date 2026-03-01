"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Key, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { UserSettings } from "@/lib/user-settings-store";

interface BillingTabProps {
	settings: UserSettings;
	onNavigate: (tab: "general" | "editor" | "ai" | "billing" | "account") => void;
}

interface BalanceData {
	totalGranted: number;
	totalUsed: number;
	available: number;
	nearestExpiry: string | null;
	welcomed: boolean;
}

interface SpendingLimitData {
	mode: "credit" | "subscription";
	monthlyCapUsd?: number | null;
	periodUsageUsd?: number;
	periodStart?: string;
	remainingUsd?: number | null;
	available?: number;
	totalGranted?: number;
}

function formatUsd(amount: number): string {
	return `$${amount.toFixed(2)}`;
}

function formatDate(date: string | Date): string {
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

async function fetchBalance(): Promise<BalanceData> {
	const res = await fetch("/api/billing/balance");
	if (!res.ok) throw new Error("Failed to load balance");
	return res.json();
}

async function fetchSpendingLimit(): Promise<SpendingLimitData> {
	const res = await fetch("/api/billing/spending-limit");
	if (!res.ok) throw new Error("Failed to load spending limit");
	return res.json();
}

async function patchSpendingLimit(value: number | null) {
	const res = await fetch("/api/billing/spending-limit", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ monthlyCapUsd: value }),
	});
	if (!res.ok) {
		const data = await res.json();
		throw new Error(data.error ?? "Failed to update");
	}
	return res.json();
}

export function BillingTab({ settings, onNavigate }: BillingTabProps) {
	const {
		data: balance,
		isLoading: balanceLoading,
		error: balanceError,
	} = useQuery({
		queryKey: ["billing-balance"],
		queryFn: fetchBalance,
		staleTime: 30_000,
		gcTime: 5 * 60_000,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
	});

	const {
		data: spendingLimit,
		isLoading: slLoading,
		error: slError,
	} = useQuery({
		queryKey: ["billing-spending-limit"],
		queryFn: fetchSpendingLimit,
		staleTime: 30_000,
		gcTime: 5 * 60_000,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
	});

	const { data: subscriptions } = useQuery({
		queryKey: ["billing-subscriptions"],
		queryFn: async () => {
			const res = await authClient.subscription.list({});
			return res.data ?? [];
		},
		staleTime: 30_000,
		gcTime: 5 * 60_000,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
	});

	const queryClient = useQueryClient();

	const invalidateBilling = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ["billing-balance"] }),
			queryClient.invalidateQueries({ queryKey: ["billing-spending-limit"] }),
			queryClient.invalidateQueries({ queryKey: ["billing-subscriptions"] }),
		]);

	const limitMutation = useMutation({
		mutationFn: patchSpendingLimit,
		onSuccess: () => invalidateBilling(),
	});

	const restoreMutation = useMutation({
		mutationFn: async () => {
			const res = await authClient.subscription.restore({});
			if (res.error) throw new Error(res.error.message ?? "Failed to restore");
			return res.data;
		},
		onSuccess: () => invalidateBilling(),
	});

	const claimCreditMutation = useMutation({
		mutationFn: async () => {
			const res = await fetch("/api/billing/welcome", { method: "POST" });
			if (!res.ok) throw new Error("Failed to claim credit");
			return res.json();
		},
		onSuccess: () => invalidateBilling(),
	});

	const [limitDialogOpen, setLimitDialogOpen] = useState(false);
	const [limitEnabled, setLimitEnabled] = useState(false);
	const [limitAmount, setLimitAmount] = useState("10.00");

	function openLimitDialog() {
		const cap = spendingLimit?.monthlyCapUsd;
		if (cap !== null && cap !== undefined) {
			setLimitEnabled(true);
			setLimitAmount(Number(cap).toFixed(2));
		} else {
			setLimitEnabled(false);
			setLimitAmount("10.00");
		}
		setLimitDialogOpen(true);
	}

	const loading = balanceLoading || slLoading;
	const error = balanceError ?? slError ?? (limitMutation.error || null);

	function handleLimitSave() {
		if (!limitEnabled) {
			limitMutation.mutate(null, { onSuccess: () => setLimitDialogOpen(false) });
			return;
		}
		const val = parseFloat(limitAmount);
		if (!Number.isFinite(val) || val < 0.01) {
			setLimitAmount("0.01");
			limitMutation.mutate(0.01, { onSuccess: () => setLimitDialogOpen(false) });
			return;
		}
		setLimitAmount(val.toFixed(2));
		limitMutation.mutate(val, { onSuccess: () => setLimitDialogOpen(false) });
	}

	if (loading) {
		return (
			<div className="px-4 py-12 flex items-center justify-center">
				<span className="text-[10px] font-mono text-muted-foreground/50">
					Loading billing...
				</span>
			</div>
		);
	}

	if (error && !balance) {
		return (
			<div className="px-4 py-12 flex flex-col items-center text-center">
				<p className="text-xs font-mono text-destructive">
					{error instanceof Error
						? error.message
						: "Failed to load billing data"}
				</p>
			</div>
		);
	}

	const isSubscription = spendingLimit?.mode === "subscription";
	const activeSubscription = subscriptions?.find(
		(s) => s.status === "active" || s.status === "trialing",
	);
	const isCanceling = !!(
		activeSubscription?.cancelAtPeriodEnd || activeSubscription?.cancelAt
	);
	const cancelDate = activeSubscription?.cancelAt ?? activeSubscription?.periodEnd;

	const usageAmount = spendingLimit?.periodUsageUsd ?? 0;

	const capUsd = spendingLimit?.monthlyCapUsd;
	const usagePct =
		capUsd != null && capUsd > 0
			? Math.min(100, Math.round((usageAmount / capUsd) * 100))
			: null;

	const hasByok = settings.useOwnApiKey && !!settings.openrouterApiKey;

	async function handleSubscribe() {
		const res = await authClient.subscription.upgrade({
			plan: "base",
			successUrl: window.location.href,
			cancelUrl: window.location.href,
		});
		if (res.data?.url) {
			window.location.href = res.data.url;
		}
	}

	return (
		<div className="divide-y divide-border">
			{/* Plan */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Plan
				</label>
				{isSubscription ? (
					<div className="mt-2">
						<span className="text-sm font-mono">Base plan</span>
						<span className="text-[10px] text-muted-foreground/50 font-mono ml-1.5">
							{isCanceling ? "canceling" : "active"}
						</span>
						{isCanceling && (
							<div className="mt-3 flex items-start gap-2.5 rounded border border-destructive/20 bg-destructive/5 px-3 py-2.5">
								<AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
								<div className="flex-1 min-w-0">
									<p className="text-xs font-mono text-destructive">
										Cancels{" "}
										{cancelDate
											? formatDate(
													cancelDate,
												)
											: "at period end"}
									</p>
									<p className="mt-0.5 text-[10px] font-mono text-muted-foreground/50">
										You can restore
										before this date.
									</p>
								</div>
								<button
									type="button"
									onClick={() =>
										restoreMutation.mutate()
									}
									disabled={
										restoreMutation.isPending
									}
									className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
								>
									{restoreMutation.isPending ? (
										"Restoring..."
									) : (
										<>
											<RotateCcw className="w-2.5 h-2.5" />
											Restore
										</>
									)}
								</button>
							</div>
						)}
					</div>
				) : (
					<>
						<p className="mt-1 text-[10px] text-muted-foreground/50 font-mono">
							You're on the free plan with credits.
							Subscribe for on-demand usage. No monthly
							fee.
						</p>
						<button
							type="button"
							onClick={handleSubscribe}
							className="mt-2 flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
						>
							Subscribe
						</button>
					</>
				)}
			</div>

			{/* Usage & Spending Limit */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					{isSubscription ? "Usage This Period" : "Usage"}
				</label>
				<div className="mt-2 flex items-baseline justify-between">
					<div>
						<span className="text-lg font-mono tabular-nums">
							{formatUsd(usageAmount)}
						</span>
						<span className="text-[10px] text-muted-foreground/50 font-mono ml-1.5">
							used
						</span>
					</div>
					{usagePct !== null && (
						<span className="text-[10px] font-mono tabular-nums text-muted-foreground">
							{usagePct}%
						</span>
					)}
				</div>
				{usagePct !== null && (
					<div className="mt-2 h-1.5 w-full bg-muted/50 dark:bg-white/[0.06] rounded-full overflow-hidden">
						<div
							className={cn(
								"h-full rounded-full transition-all",
								usagePct >= 90
									? "bg-destructive"
									: "bg-foreground/80",
							)}
							style={{ width: `${usagePct}%` }}
						/>
					</div>
				)}
				{isSubscription && spendingLimit.periodStart && (
					<p className="mt-1 text-[10px] text-muted-foreground/50 font-mono">
						{formatDate(spendingLimit.periodStart)}
						{activeSubscription?.periodEnd &&
							` – ${formatDate(activeSubscription.periodEnd)}`}
					</p>
				)}

				<div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
					<p className="text-xs font-mono text-muted-foreground">
						Monthly spend limit:{" "}
						<span className="text-foreground">
							{capUsd != null
								? formatUsd(capUsd)
								: "No limit"}
						</span>
					</p>
					<button
						type="button"
						onClick={openLimitDialog}
						className="text-[10px] font-mono text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
					>
						Adjust limit
					</button>
				</div>

				<Dialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
					<DialogContent className="sm:max-w-sm">
						<DialogHeader>
							<DialogTitle className="text-sm font-mono">
								Spending Limit
							</DialogTitle>
							<DialogDescription className="text-xs font-mono">
								Set a maximum monthly budget. Usage
								from the last request can slightly
								exceed this limit.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-3 py-2">
							<label className="flex items-center gap-2.5 cursor-pointer">
								<span
									className={cn(
										"w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0",
										!limitEnabled
											? "border-foreground"
											: "border-muted-foreground/30",
									)}
								>
									{!limitEnabled && (
										<span className="w-1.5 h-1.5 rounded-full bg-foreground" />
									)}
								</span>
								<input
									type="radio"
									name="spending-limit"
									checked={!limitEnabled}
									onChange={() =>
										setLimitEnabled(
											false,
										)
									}
									className="sr-only"
								/>
								<span className="text-xs font-mono">
									No limit
								</span>
							</label>
							<label className="flex items-center gap-2.5 cursor-pointer">
								<span
									className={cn(
										"w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0",
										limitEnabled
											? "border-foreground"
											: "border-muted-foreground/30",
									)}
								>
									{limitEnabled && (
										<span className="w-1.5 h-1.5 rounded-full bg-foreground" />
									)}
								</span>
								<input
									type="radio"
									name="spending-limit"
									checked={limitEnabled}
									onChange={() =>
										setLimitEnabled(
											true,
										)
									}
									className="sr-only"
								/>
								<span className="flex items-center gap-1.5 text-xs font-mono">
									<span className="text-muted-foreground">
										$
									</span>
									<input
										type="text"
										inputMode="decimal"
										value={limitAmount}
										onFocus={() =>
											setLimitEnabled(
												true,
											)
										}
										onChange={(e) => {
											setLimitEnabled(
												true,
											);
											setLimitAmount(
												e
													.target
													.value,
											);
										}}
										className="w-16 border border-border px-1.5 py-0.5 text-xs font-mono tabular-nums bg-transparent outline-none focus:border-foreground/30"
									/>
									<span className="text-muted-foreground/50">
										per month
									</span>
								</span>
							</label>
						</div>
						<DialogFooter>
							<button
								type="button"
								onClick={() =>
									setLimitDialogOpen(false)
								}
								className="border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleLimitSave}
								disabled={limitMutation.isPending}
								className="border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{limitMutation.isPending
									? "Saving..."
									: "Save"}
							</button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			{/* Credit Balance */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Credit Balance
				</label>
				<p className="mt-1 text-[10px] text-muted-foreground/50 font-mono">
					Granted on signup and through promotional events.
				</p>
				{balance && (
					<div className="mt-3">
						<span className="text-lg font-mono tabular-nums">
							{formatUsd(balance.available)}
						</span>
						{balance.nearestExpiry && (
							<p className="mt-2 text-[10px] text-muted-foreground/50 font-mono">
								Expires{" "}
								{formatDate(balance.nearestExpiry)}
							</p>
						)}
						{!balance.welcomed && (
							<button
								type="button"
								onClick={() =>
									claimCreditMutation.mutate()
								}
								disabled={
									claimCreditMutation.isPending
								}
								className="mt-3 flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{claimCreditMutation.isPending
									? "Loading..."
									: "🎉 Get welcome credit"}
							</button>
						)}
					</div>
				)}
			</div>

			{/* API Key (BYOK) */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
					<Key className="w-3 h-3" />
					API Key
				</label>
				<p className="mt-1 text-[10px] text-muted-foreground/50 font-mono">
					{hasByok
						? "Your OpenRouter API key is active. AI requests are billed to your OpenRouter account."
						: "No API key configured. AI requests will use your credits."}
				</p>
				{!hasByok && (
					<button
						type="button"
						onClick={() => onNavigate("ai")}
						className="mt-2 text-[10px] font-mono text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
					>
						Configure in AI / Model settings
					</button>
				)}
			</div>

			{/* Manage Billing — only shown when the user has an active subscription */}
			{activeSubscription && (
				<div className="px-4 py-4">
					<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
						Manage
					</label>
					<p className="mt-1 text-[10px] text-muted-foreground/50 font-mono">
						Payment methods, invoices, subscription details, and
						cancellation.
					</p>
					<button
						type="button"
						onClick={async () => {
							const res =
								await authClient.subscription.billingPortal(
									{
										returnUrl: window.location
											.href,
									},
								);
							if (res.data?.url) {
								window.location.href = res.data.url;
							}
						}}
						className="mt-2 flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
					>
						<ExternalLink className="w-3 h-3" />
						Manage billing
					</button>
				</div>
			)}
		</div>
	);
}
