"use client";

import { useState } from "react";
import { Bug, ExternalLink, FileText, KeyRound, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";

interface Advisory {
	ghsaId: string;
	cveId: string | null;
	state: string;
	severity: string | null;
	summary: string;
	createdAt: string;
	updatedAt: string;
	publishedAt: string | null;
	closedAt: string | null;
	htmlUrl: string;
	acceptedPrivateReport: boolean;
}

interface DependabotAlert {
	number: number;
	state: string;
	severity: string | null;
	packageName: string | null;
	ecosystem: string | null;
	summary: string;
	createdAt: string;
	htmlUrl: string;
}

interface SecretAlert {
	number: number;
	state: string;
	secretType: string | null;
	secretTypeDisplayName: string | null;
	resolution: string | null;
	createdAt: string;
	htmlUrl: string;
}

interface AlertsResult<T> {
	alerts: T[];
	error: string | null;
}

type Section = "advisories" | "dependabot" | "secret-scanning" | "policy";
type AdvisoryState = "all" | "triage" | "draft" | "published" | "closed";

const ADVISORY_TABS: AdvisoryState[] = ["all", "triage", "draft", "published", "closed"];

function severityColor(severity: string | null): {
	dot: string;
	text: string;
	border: string;
} {
	switch (severity?.toLowerCase()) {
		case "critical":
			return {
				dot: "bg-destructive",
				text: "text-destructive",
				border: "border-l-destructive",
			};
		case "high":
			return {
				dot: "bg-orange-500",
				text: "text-orange-600 dark:text-orange-400",
				border: "border-l-orange-500",
			};
		case "medium":
			return {
				dot: "bg-warning",
				text: "text-warning",
				border: "border-l-warning",
			};
		case "low":
			return {
				dot: "bg-success",
				text: "text-success",
				border: "border-l-success",
			};
		default:
			return {
				dot: "bg-muted-foreground",
				text: "text-muted-foreground/60",
				border: "border-l-transparent",
			};
	}
}

function countByState(advisories: Advisory[], state: AdvisoryState): number {
	if (state === "all") return advisories.length;
	return advisories.filter(
		(a) =>
			a.state.toLowerCase() === state ||
			(state === "closed" && a.state.toLowerCase() === "withdrawn"),
	).length;
}

export function SecurityView({
	owner,
	repo,
	advisories,
	advisoriesError,
	dependabot,
	secretScanning,
	policyHtml,
	isOwner,
}: {
	owner: string;
	repo: string;
	advisories: Advisory[];
	advisoriesError: string | null;
	dependabot: AlertsResult<DependabotAlert>;
	secretScanning: AlertsResult<SecretAlert>;
	policyHtml: string | null;
	isOwner: boolean;
}) {
	const [section, setSection] = useState<Section>("policy");
	const [advisoryTab, setAdvisoryTab] = useState<AdvisoryState>(
		isOwner ? "all" : "published",
	);

	const baseUrl = `https://github.com/${owner}/${repo}/security`;

	const filteredAdvisories =
		advisoryTab === "all"
			? advisories
			: advisories.filter(
					(a) =>
						a.state.toLowerCase() === advisoryTab ||
						(advisoryTab === "closed" &&
							a.state.toLowerCase() === "withdrawn"),
				);

	const sidebarItems: {
		key: Section;
		label: string;
		icon: React.ReactNode;
		count?: number;
	}[] = [
		{
			key: "policy",
			label: "Policy",
			icon: <FileText className="w-3.5 h-3.5" />,
		},
		{
			key: "advisories",
			label: "Advisories",
			icon: <ShieldAlert className="w-3.5 h-3.5" />,
			count: advisories.length,
		},
		{
			key: "dependabot",
			label: "Dependabot",
			icon: <Bug className="w-3.5 h-3.5" />,
			count: dependabot.error ? undefined : dependabot.alerts.length,
		},
		{
			key: "secret-scanning",
			label: "Secret scanning",
			icon: <KeyRound className="w-3.5 h-3.5" />,
			count: secretScanning.error ? undefined : secretScanning.alerts.length,
		},
	];

	return (
		<div className="flex gap-4 h-full min-h-0">
			{/* Sidebar — sticky, never scrolls */}
			<nav className="w-48 shrink-0 hidden md:block sticky top-0 self-start">
				<div className="space-y-0.5">
					{sidebarItems.map((item) => (
						<button
							key={item.key}
							onClick={() => setSection(item.key)}
							className={cn(
								"w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors cursor-pointer",
								section === item.key
									? "bg-muted/60 dark:bg-white/[0.04] text-foreground font-medium"
									: "text-muted-foreground hover:text-foreground hover:bg-muted/30 dark:hover:bg-white/[0.02]",
							)}
						>
							{item.icon}
							<span className="flex-1 text-left">
								{item.label}
							</span>
							{item.count !== undefined && (
								<span
									className={cn(
										"text-[10px] font-mono px-1.5 py-0.5 rounded-full",
										section === item.key
											? "bg-muted text-foreground/70"
											: "bg-muted/60 text-muted-foreground/50",
									)}
								>
									{item.count}
								</span>
							)}
						</button>
					))}
				</div>
			</nav>

			{/* Content — flex column, headers fixed, list scrolls */}
			<div className="flex-1 min-w-0 flex flex-col min-h-0">
				{/* Mobile selector */}
				<div className="md:hidden shrink-0">
					<div className="flex items-center gap-0 border-b border-border mb-4">
						{sidebarItems.map((item) => (
							<button
								key={item.key}
								onClick={() => setSection(item.key)}
								className={cn(
									"flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider border-b -mb-px transition-colors cursor-pointer",
									section === item.key
										? "border-b-foreground/50 text-foreground"
										: "border-b-transparent text-muted-foreground hover:text-foreground/60",
								)}
							>
								{item.label}
							</button>
						))}
					</div>
				</div>

				{section === "advisories" && (
					<AdvisoriesSection
						owner={owner}
						repo={repo}
						advisories={advisories}
						advisoriesError={advisoriesError}
						filteredAdvisories={filteredAdvisories}
						advisoryTab={advisoryTab}
						setAdvisoryTab={setAdvisoryTab}
						baseUrl={baseUrl}
						isOwner={isOwner}
					/>
				)}

				{section === "dependabot" && (
					<AlertListSection
						label="Dependabot"
						icon={
							<Bug className="w-3.5 h-3.5 text-muted-foreground/60" />
						}
						href={`${baseUrl}/dependabot`}
						error={dependabot.error}
						alerts={dependabot.alerts}
						renderAlert={(alert) => (
							<>
								<p className="text-xs truncate">
									{alert.packageName ??
										"unknown"}{" "}
									— {alert.summary}
								</p>
								<div className="flex items-center gap-3 mt-1">
									{alert.severity && (
										<span className="text-[11px] font-mono text-muted-foreground/60">
											{alert.severity.toLowerCase()}
										</span>
									)}
									{alert.ecosystem && (
										<span className="text-[11px] font-mono text-muted-foreground/50">
											{
												alert.ecosystem
											}
										</span>
									)}
									<span className="text-[11px] text-muted-foreground">
										<TimeAgo
											date={
												alert.createdAt
											}
										/>
									</span>
								</div>
							</>
						)}
						getHref={(alert) => alert.htmlUrl}
					/>
				)}

				{section === "secret-scanning" && (
					<AlertListSection
						label="Secret scanning"
						icon={
							<KeyRound className="w-3.5 h-3.5 text-muted-foreground/60" />
						}
						href={`${baseUrl}/secret-scanning`}
						error={secretScanning.error}
						alerts={secretScanning.alerts}
						renderAlert={(alert) => (
							<>
								<p className="text-xs truncate">
									{alert.secretTypeDisplayName ??
										alert.secretType ??
										"Unknown secret"}
								</p>
								<div className="flex items-center gap-3 mt-1">
									<span className="text-[11px] text-muted-foreground">
										<TimeAgo
											date={
												alert.createdAt
											}
										/>
									</span>
								</div>
							</>
						)}
						getHref={(alert) => alert.htmlUrl}
					/>
				)}

				{section === "policy" && (
					<PolicySection
						policyHtml={policyHtml}
						owner={owner}
						repo={repo}
					/>
				)}
			</div>
		</div>
	);
}

function AdvisoriesSection({
	owner,
	repo,
	advisories,
	advisoriesError,
	filteredAdvisories,
	advisoryTab,
	setAdvisoryTab,
	baseUrl,
	isOwner,
}: {
	owner: string;
	repo: string;
	advisories: Advisory[];
	advisoriesError: string | null;
	filteredAdvisories: Advisory[];
	advisoryTab: AdvisoryState;
	setAdvisoryTab: (tab: AdvisoryState) => void;
	baseUrl: string;
	isOwner: boolean;
}) {
	const visibleTabs: AdvisoryState[] = isOwner ? ADVISORY_TABS : ["published", "closed"];
	return (
		<section className="border border-border flex flex-col min-h-0 flex-1">
			{/* Sticky header */}
			<div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-1.5 text-xs bg-background">
				<ShieldAlert className="w-3.5 h-3.5 text-muted-foreground/60" />
				<span className="font-medium">Advisories</span>
				<a
					href={`${baseUrl}/advisories`}
					target="_blank"
					rel="noopener noreferrer"
					className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
				>
					<ExternalLink className="w-3 h-3" />
				</a>
			</div>

			{advisoriesError ? (
				<p className="px-4 py-4 text-[11px] text-muted-foreground/60">
					{advisoriesError}
				</p>
			) : (
				<>
					{/* Sticky tabs */}
					<div className="shrink-0 flex items-center gap-0 border-b border-border bg-background">
						{visibleTabs.map((tab) => {
							const count = countByState(advisories, tab);
							return (
								<button
									key={tab}
									onClick={() =>
										setAdvisoryTab(tab)
									}
									className={cn(
										"flex items-center gap-1.5 px-4 py-2 text-[11px] font-mono uppercase tracking-wider border-b -mb-px transition-colors cursor-pointer",
										advisoryTab === tab
											? "border-b-foreground/50 text-foreground"
											: "border-b-transparent text-muted-foreground hover:text-foreground/60",
									)}
								>
									{tab}
									<span
										className={cn(
											"text-[9px] px-1.5 py-0.5 border",
											advisoryTab ===
												tab
												? "border-border text-foreground/60"
												: "border-border text-muted-foreground/50",
										)}
									>
										{count}
									</span>
								</button>
							);
						})}
					</div>

					{/* Scrollable list */}
					<div className="overflow-y-auto min-h-0 flex-1 divide-y divide-border">
						{filteredAdvisories.map((advisory) => {
							const sev = severityColor(
								advisory.severity,
							);
							return (
								<Link
									key={
										advisory.ghsaId ||
										advisory.htmlUrl
									}
									href={`/${owner}/${repo}/security/advisories/${advisory.ghsaId}`}
									className={cn(
										"block px-4 py-3 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-l-2",
										sev.border,
									)}
								>
									<div className="flex items-center gap-2">
										<span className="text-sm flex-1 min-w-0 truncate">
											{advisory.summary ||
												advisory.ghsaId}
										</span>
										<span className="text-[10px] text-muted-foreground shrink-0">
											<TimeAgo
												date={
													advisory.publishedAt ||
													advisory.updatedAt ||
													advisory.createdAt
												}
											/>
										</span>
									</div>
									<div className="flex items-center gap-3 mt-1">
										{advisory.severity && (
											<span className="flex items-center gap-1.5">
												<span
													className={cn(
														"w-1.5 h-1.5 rounded-full shrink-0",
														sev.dot,
													)}
												/>
												<span
													className={cn(
														"text-[11px] font-mono",
														sev.text,
													)}
												>
													{advisory.severity.toLowerCase()}
												</span>
											</span>
										)}
										<span className="text-[11px] font-mono text-muted-foreground/70">
											{
												advisory.ghsaId
											}
										</span>
										{advisory.cveId && (
											<span className="text-[11px] font-mono text-muted-foreground/50">
												{
													advisory.cveId
												}
											</span>
										)}
									</div>
								</Link>
							);
						})}

						{filteredAdvisories.length === 0 && (
							<div className="py-16 text-center">
								<ShieldAlert className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
								<p className="text-xs text-muted-foreground font-mono">
									No{" "}
									{advisoryTab === "all"
										? ""
										: advisoryTab + " "}
									advisories
								</p>
							</div>
						)}
					</div>
				</>
			)}
		</section>
	);
}

function AlertListSection<T>({
	label,
	icon,
	href,
	error,
	alerts,
	renderAlert,
	getHref,
}: {
	label: string;
	icon: React.ReactNode;
	href: string;
	error: string | null;
	alerts: T[];
	renderAlert: (alert: T) => React.ReactNode;
	getHref: (alert: T) => string;
}) {
	return (
		<section className="border border-border flex flex-col min-h-0 flex-1">
			{/* Sticky header */}
			<div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-1.5 text-xs bg-background">
				{icon}
				<span className="font-medium">{label}</span>
				<span className="ml-auto text-[10px] font-mono text-muted-foreground/50">
					{error ? "-" : alerts.length} open
				</span>
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="text-muted-foreground hover:text-foreground transition-colors ml-1"
				>
					<ExternalLink className="w-3 h-3" />
				</a>
			</div>

			{/* Scrollable list */}
			{error ? (
				<p className="px-4 py-4 text-[11px] text-muted-foreground/60">
					{error}
				</p>
			) : alerts.length === 0 ? (
				<div className="px-4 py-16 text-center">
					<p className="text-xs text-muted-foreground/50 font-mono">
						No open alerts
					</p>
				</div>
			) : (
				<div className="overflow-y-auto min-h-0 flex-1 divide-y divide-border">
					{alerts.map((alert, i) => (
						<a
							key={i}
							href={getHref(alert) || href}
							target="_blank"
							rel="noopener noreferrer"
							className="block px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
						>
							{renderAlert(alert)}
						</a>
					))}
				</div>
			)}
		</section>
	);
}

function PolicySection({
	policyHtml,
	owner,
	repo,
}: {
	policyHtml: string | null;
	owner: string;
	repo: string;
}) {
	const policyUrl = `https://github.com/${owner}/${repo}/security/policy`;

	return (
		<section className="border border-border flex flex-col min-h-0 flex-1">
			{/* Sticky header */}
			<div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-1.5 text-xs bg-background">
				<FileText className="w-3.5 h-3.5 text-muted-foreground/60" />
				<span className="font-medium">Security policy</span>
				<a
					href={policyUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
				>
					<ExternalLink className="w-3 h-3" />
				</a>
			</div>

			{/* Scrollable content */}
			{policyHtml ? (
				<div className="overflow-y-auto min-h-0 flex-1 px-4 py-4">
					<div
						className="ghmd"
						dangerouslySetInnerHTML={{ __html: policyHtml }}
					/>
				</div>
			) : (
				<div className="px-4 py-16 text-center">
					<FileText className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
					<p className="text-xs text-muted-foreground font-mono">
						No security policy found
					</p>
					<p className="text-[11px] text-muted-foreground/50 mt-1">
						Add a SECURITY.md file to define a security policy
					</p>
				</div>
			)}
		</section>
	);
}
