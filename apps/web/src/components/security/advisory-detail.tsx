"use client";

import { ArrowLeft, ExternalLink, ShieldAlert, User } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import type { SecurityAdvisoryDetail } from "@/lib/github";

function severityColor(severity: string | null): {
	dot: string;
	text: string;
	bg: string;
} {
	switch (severity?.toLowerCase()) {
		case "critical":
			return {
				dot: "bg-destructive",
				text: "text-destructive",
				bg: "bg-destructive/10",
			};
		case "high":
			return {
				dot: "bg-orange-500",
				text: "text-orange-600 dark:text-orange-400",
				bg: "bg-orange-500/10",
			};
		case "medium":
			return {
				dot: "bg-warning",
				text: "text-warning",
				bg: "bg-warning/10",
			};
		case "low":
			return {
				dot: "bg-success",
				text: "text-success",
				bg: "bg-success/10",
			};
		default:
			return {
				dot: "bg-muted-foreground",
				text: "text-muted-foreground/60",
				bg: "bg-muted/50",
			};
	}
}

function stateLabel(state: string): { label: string; className: string } {
	switch (state.toLowerCase()) {
		case "published":
			return { label: "Published", className: "bg-success/10 text-success" };
		case "closed":
			return {
				label: "Closed",
				className: "bg-muted/60 text-muted-foreground",
			};
		case "withdrawn":
			return {
				label: "Withdrawn",
				className: "bg-muted/60 text-muted-foreground",
			};
		case "draft":
			return {
				label: "Draft",
				className: "bg-warning/10 text-warning",
			};
		case "triage":
			return {
				label: "Triage",
				className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
			};
		default:
			return {
				label: state,
				className: "bg-muted/60 text-muted-foreground",
			};
	}
}

export function AdvisoryDetail({
	advisory,
	owner,
	repo,
	descriptionHtml,
}: {
	advisory: SecurityAdvisoryDetail;
	owner: string;
	repo: string;
	descriptionHtml: string | null;
}) {
	const sev = severityColor(advisory.severity);
	const state = stateLabel(advisory.state);

	return (
		<div className="space-y-6">
			{/* Back link */}
			<Link
				href={`/${owner}/${repo}/security`}
				className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
			>
				<ArrowLeft className="w-3 h-3" />
				<span className="font-mono">Security</span>
			</Link>

			{/* Header */}
			<div className="space-y-3">
				<div className="flex items-start gap-3">
					<h1 className="text-lg font-medium flex-1 min-w-0">
						{advisory.summary}
					</h1>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{/* State badge */}
					<span
						className={cn(
							"text-[11px] font-mono px-2 py-0.5 rounded-sm",
							state.className,
						)}
					>
						{state.label}
					</span>

					{/* Severity badge */}
					{advisory.severity && (
						<span
							className={cn(
								"flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-sm",
								sev.bg,
								sev.text,
							)}
						>
							<span
								className={cn(
									"w-1.5 h-1.5 rounded-full",
									sev.dot,
								)}
							/>
							{advisory.severity.toLowerCase()}
						</span>
					)}

					{/* GHSA ID */}
					<span className="text-[11px] font-mono text-muted-foreground/70">
						{advisory.ghsaId}
					</span>

					{/* CVE ID */}
					{advisory.cveId && (
						<span className="text-[11px] font-mono text-muted-foreground/50">
							{advisory.cveId}
						</span>
					)}
				</div>
			</div>

			{/* Main content + sidebar */}
			<div className="flex flex-col lg:flex-row gap-6">
				{/* Main content */}
				<div className="flex-1 min-w-0 space-y-6">
					{/* Description */}
					{descriptionHtml ? (
						<section className="border border-border">
							<div className="px-4 py-2.5 border-b border-border text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
								Description
							</div>
							<div
								className="ghmd px-4 py-4"
								dangerouslySetInnerHTML={{
									__html: descriptionHtml,
								}}
							/>
						</section>
					) : (
						<section className="border border-border">
							<div className="px-4 py-2.5 border-b border-border text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
								Description
							</div>
							<p className="px-4 py-8 text-xs text-muted-foreground/50 text-center font-mono">
								No description provided
							</p>
						</section>
					)}

					{/* Affected packages */}
					{advisory.vulnerabilities.length > 0 && (
						<section className="border border-border">
							<div className="px-4 py-2.5 border-b border-border text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
								Affected packages
							</div>
							<div className="divide-y divide-border">
								{advisory.vulnerabilities.map(
									(vuln, i) => (
										<div
											key={i}
											className="px-4 py-3 space-y-1.5"
										>
											<div className="flex items-center gap-2">
												<span className="text-xs font-medium">
													{vuln.packageName ??
														"Unknown package"}
												</span>
												{vuln.ecosystem && (
													<span className="text-[10px] font-mono px-1.5 py-0.5 bg-muted/60 text-muted-foreground/60 rounded-sm">
														{
															vuln.ecosystem
														}
													</span>
												)}
											</div>
											<div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
												{vuln.vulnerableVersionRange && (
													<span className="text-muted-foreground">
														<span className="text-muted-foreground/50">
															Vulnerable:{" "}
														</span>
														<span className="font-mono">
															{
																vuln.vulnerableVersionRange
															}
														</span>
													</span>
												)}
												{vuln.patchedVersions && (
													<span className="text-muted-foreground">
														<span className="text-muted-foreground/50">
															Patched:{" "}
														</span>
														<span className="font-mono text-success">
															{
																vuln.patchedVersions
															}
														</span>
													</span>
												)}
											</div>
										</div>
									),
								)}
							</div>
						</section>
					)}
				</div>

				{/* Sidebar */}
				<aside className="lg:w-64 shrink-0 space-y-4">
					{/* CVSS */}
					{advisory.cvss && (
						<div className="border border-border p-3 space-y-1.5">
							<div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/50">
								CVSS Score
							</div>
							<div className="flex items-baseline gap-2">
								<span
									className={cn(
										"text-xl font-mono font-medium",
										sev.text,
									)}
								>
									{advisory.cvss.score.toFixed(
										1,
									)}
								</span>
								<span className="text-[10px] text-muted-foreground">
									/ 10.0
								</span>
							</div>
							<p className="text-[10px] font-mono text-muted-foreground break-all">
								{advisory.cvss.vectorString}
							</p>
						</div>
					)}

					{/* CWEs */}
					{advisory.cwes.length > 0 && (
						<div className="border border-border p-3 space-y-1.5">
							<div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/50">
								Weaknesses
							</div>
							<div className="space-y-1">
								{advisory.cwes.map((cwe) => (
									<div
										key={cwe.cweId}
										className="text-xs"
									>
										<span className="font-mono text-muted-foreground/70">
											{cwe.cweId}
										</span>
										{cwe.name && (
											<span className="text-muted-foreground/50">
												{" "}
												—{" "}
												{
													cwe.name
												}
											</span>
										)}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Credits */}
					{advisory.credits.length > 0 && (
						<div className="border border-border p-3 space-y-1.5">
							<div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/50">
								Credits
							</div>
							<div className="space-y-2">
								{advisory.credits.map(
									(credit, i) => (
										<div
											key={i}
											className="flex items-center gap-2"
										>
											{credit.avatarUrl ? (
												<Image
													src={
														credit.avatarUrl
													}
													alt={
														credit.login
													}
													width={
														20
													}
													height={
														20
													}
													className="rounded-full"
												/>
											) : (
												<User className="w-5 h-5 text-muted-foreground" />
											)}
											<span className="text-xs">
												{
													credit.login
												}
											</span>
											<span className="text-[10px] font-mono text-muted-foreground">
												{
													credit.type
												}
											</span>
										</div>
									),
								)}
							</div>
						</div>
					)}

					{/* Timestamps */}
					<div className="border border-border p-3 space-y-1.5">
						<div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/50">
							Timeline
						</div>
						<div className="space-y-1 text-[11px]">
							{advisory.publishedAt && (
								<div className="flex justify-between">
									<span className="text-muted-foreground/50">
										Published
									</span>
									<TimeAgo
										date={
											advisory.publishedAt
										}
									/>
								</div>
							)}
							<div className="flex justify-between">
								<span className="text-muted-foreground/50">
									Created
								</span>
								<TimeAgo
									date={advisory.createdAt}
								/>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground/50">
									Updated
								</span>
								<TimeAgo
									date={advisory.updatedAt}
								/>
							</div>
							{advisory.closedAt && (
								<div className="flex justify-between">
									<span className="text-muted-foreground/50">
										Closed
									</span>
									<TimeAgo
										date={
											advisory.closedAt
										}
									/>
								</div>
							)}
						</div>
					</div>

					{/* Author */}
					{advisory.author && (
						<div className="border border-border p-3 space-y-1.5">
							<div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/50">
								Author
							</div>
							<div className="flex items-center gap-2">
								{advisory.author.avatarUrl ? (
									<Image
										src={
											advisory
												.author
												.avatarUrl
										}
										alt={
											advisory
												.author
												.login
										}
										width={20}
										height={20}
										className="rounded-full"
									/>
								) : (
									<User className="w-5 h-5 text-muted-foreground" />
								)}
								<span className="text-xs">
									{advisory.author.login}
								</span>
							</div>
						</div>
					)}

					{/* View on GitHub */}
					<a
						href={advisory.htmlUrl}
						data-no-github-intercept
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center justify-center gap-2 w-full border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
					>
						<ExternalLink className="w-3 h-3" />
						View on GitHub
					</a>
				</aside>
			</div>
		</div>
	);
}
