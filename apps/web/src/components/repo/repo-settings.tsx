"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
	AlertTriangle,
	Archive,
	ChevronDown,
	ExternalLink,
	Eye,
	EyeOff,
	GitBranch,
	Globe,
	Hash,
	GitMerge,
	Layers,
	Settings,
	Trash2,
	X,
	Check,
} from "lucide-react";
import {
	updateRepoSettings,
	updateRepoTopics,
	updateDefaultBranch,
	archiveRepository,
	deleteRepository,
} from "@/app/(app)/repos/[owner]/[repo]/settings/actions";

interface RepoData {
	name: string;
	description: string | null;
	homepage: string | null;
	private: boolean;
	archived: boolean;
	topics: string[];
	default_branch: string;
	has_wiki: boolean;
	has_issues: boolean;
	has_projects: boolean;
	has_discussions: boolean;
	allow_merge_commit: boolean;
	allow_squash_merge: boolean;
	allow_rebase_merge: boolean;
	delete_branch_on_merge: boolean;
}

interface RepoSettingsProps {
	owner: string;
	repo: string;
	repoData: RepoData;
	branches: string[];
}

/* ─── Primitives ─────────────────────────────────────────────── */

function Toggle({
	checked,
	onChange,
	disabled,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors cursor-pointer",
				checked ? "bg-foreground" : "bg-muted-foreground/20",
				disabled && "opacity-40 cursor-not-allowed",
			)}
		>
			<span
				className={cn(
					"pointer-events-none block h-3 w-3 rounded-full transition-all duration-200",
					checked
						? "translate-x-[17px] bg-background"
						: "translate-x-[3px] bg-muted-foreground/60",
				)}
			/>
		</button>
	);
}

function SectionCard({
	children,
	variant = "default",
	dashed = false,
	className,
}: {
	children: React.ReactNode;
	variant?: "default" | "danger";
	dashed?: boolean;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"relative rounded-md p-4 overflow-hidden",
				dashed ? "border border-dashed" : "border",
				variant === "danger" ? "border-destructive/15" : "border-border/30",
				className,
			)}
		>
			{children}
		</section>
	);
}

function SectionHeader({
	icon: Icon,
	title,
	description,
	variant = "default",
}: {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	description?: string;
	variant?: "default" | "danger";
}) {
	return (
		<div className="mb-4">
			<div className="flex items-center gap-2">
				<div
					className={cn(
						"flex items-center justify-center w-6 h-6 rounded border",
						variant === "danger"
							? "border-destructive/20 bg-destructive/5"
							: "border-border/40 bg-muted/50 dark:bg-white/[0.03]",
					)}
				>
					<Icon
						className={cn(
							"w-3 h-3",
							variant === "danger"
								? "text-destructive/60"
								: "text-muted-foreground/50",
						)}
					/>
				</div>
				<div>
					<h3
						className={cn(
							"text-xs font-medium",
							variant === "danger"
								? "text-destructive/80"
								: "text-foreground/90",
						)}
					>
						{title}
					</h3>
					{description && (
						<p className="text-[10px] text-muted-foreground mt-0.5">
							{description}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

function SaveFooter({
	onClick,
	pending,
	disabled,
	error,
	success,
}: {
	onClick: () => void;
	pending: boolean;
	disabled?: boolean;
	error: string | null;
	success: string | null;
}) {
	return (
		<div className="flex items-center gap-3 mt-4 pt-3 border-t border-dashed border-border/25">
			<button
				onClick={onClick}
				disabled={pending || disabled}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer",
					pending || disabled
						? "bg-muted/50 text-muted-foreground/25 cursor-not-allowed"
						: "bg-foreground text-background hover:opacity-90 active:scale-[0.98]",
				)}
			>
				{pending ? (
					<>
						<svg
							className="w-3 h-3 animate-spin"
							viewBox="0 0 16 16"
							fill="none"
						>
							<circle
								cx="8"
								cy="8"
								r="6"
								stroke="currentColor"
								strokeWidth="2"
								strokeDasharray="28"
								strokeDashoffset="8"
								strokeLinecap="round"
							/>
						</svg>
						Saving...
					</>
				) : (
					"Save changes"
				)}
			</button>
			{error && <span className="text-[10px] text-destructive/80">{error}</span>}
			{success && (
				<span className="inline-flex items-center gap-1 text-[10px] text-emerald-500/80">
					<Check className="w-3 h-3" />
					{success}
				</span>
			)}
		</div>
	);
}

function ToggleRow({
	label,
	description,
	checked,
	onChange,
	disabled,
	last,
}: {
	label: string;
	description?: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
	last?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-4 px-3 py-3 transition-colors",
				!disabled && "hover:bg-muted/40 dark:hover:bg-white/[0.02]",
				!last && "border-b border-border/20",
			)}
		>
			<div className="min-w-0">
				<span className="text-xs font-medium text-foreground/85">
					{label}
				</span>
				{description && (
					<p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
						{description}
					</p>
				)}
			</div>
			<Toggle checked={checked} onChange={onChange} disabled={disabled} />
		</div>
	);
}

/* ─── Main Component ─────────────────────────────────────────── */

export function RepoSettings({ owner, repo, repoData, branches }: RepoSettingsProps) {
	const router = useRouter();

	// General
	const [name, setName] = useState(repoData.name);
	const [description, setDescription] = useState(repoData.description ?? "");
	const [homepage, setHomepage] = useState(repoData.homepage ?? "");
	const [visibility, setVisibility] = useState<"public" | "private">(
		repoData.private ? "private" : "public",
	);
	const [confirmVisibility, setConfirmVisibility] = useState(false);
	const [generalPending, startGeneralTransition] = useTransition();
	const [generalError, setGeneralError] = useState<string | null>(null);
	const [generalSuccess, setGeneralSuccess] = useState<string | null>(null);

	// Topics
	const [topics, setTopics] = useState<string[]>(repoData.topics);
	const [topicInput, setTopicInput] = useState("");
	const [topicsPending, startTopicsTransition] = useTransition();
	const [topicsError, setTopicsError] = useState<string | null>(null);
	const [topicsSuccess, setTopicsSuccess] = useState<string | null>(null);
	const topicInputRef = useRef<HTMLInputElement>(null);

	// Default branch
	const [defaultBranch, setDefaultBranch] = useState(repoData.default_branch);
	const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
	const [branchPending, startBranchTransition] = useTransition();
	const [branchError, setBranchError] = useState<string | null>(null);
	const [branchSuccess, setBranchSuccess] = useState<string | null>(null);

	// Features
	const [features, setFeatures] = useState({
		has_wiki: repoData.has_wiki,
		has_issues: repoData.has_issues,
		has_projects: repoData.has_projects,
		has_discussions: repoData.has_discussions,
	});
	const [featuresPending, startFeaturesTransition] = useTransition();
	const [featuresError, setFeaturesError] = useState<string | null>(null);
	const [featuresSuccess, setFeaturesSuccess] = useState<string | null>(null);

	// Merge settings
	const [mergeSettings, setMergeSettings] = useState({
		allow_merge_commit: repoData.allow_merge_commit,
		allow_squash_merge: repoData.allow_squash_merge,
		allow_rebase_merge: repoData.allow_rebase_merge,
		delete_branch_on_merge: repoData.delete_branch_on_merge,
	});
	const [mergePending, startMergeTransition] = useTransition();
	const [mergeError, setMergeError] = useState<string | null>(null);
	const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);

	// Danger zone
	const [confirmArchive, setConfirmArchive] = useState(false);
	const [deleteConfirmName, setDeleteConfirmName] = useState("");
	const [dangerPending, startDangerTransition] = useTransition();
	const [dangerError, setDangerError] = useState<string | null>(null);

	const isArchived = repoData.archived;

	function handleSaveGeneral() {
		setGeneralError(null);
		setGeneralSuccess(null);
		const isPrivate = visibility === "private";
		if (isPrivate !== repoData.private && !confirmVisibility) {
			setConfirmVisibility(true);
			return;
		}
		startGeneralTransition(async () => {
			const result = await updateRepoSettings(owner, repo, {
				name: name !== repoData.name ? name : undefined,
				description: description || undefined,
				homepage: homepage || undefined,
				private: isPrivate,
			});
			if (result.success) {
				setConfirmVisibility(false);
				setGeneralSuccess("Settings saved");
				if (result.newName && result.newName !== repo) {
					router.push(`/${owner}/${result.newName}/settings`);
				} else {
					router.refresh();
				}
			} else {
				setGeneralError(result.error ?? "Failed to save");
			}
		});
	}

	function handleSaveTopics() {
		setTopicsError(null);
		setTopicsSuccess(null);
		startTopicsTransition(async () => {
			const result = await updateRepoTopics(owner, repo, topics);
			if (result.success) {
				setTopicsSuccess("Topics updated");
				router.refresh();
			} else {
				setTopicsError(result.error ?? "Failed to update topics");
			}
		});
	}

	function addTopic(value: string) {
		const tag = value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9-]/g, "-");
		if (tag && !topics.includes(tag)) {
			setTopics([...topics, tag]);
		}
		setTopicInput("");
	}

	function removeTopic(tag: string) {
		setTopics(topics.filter((t) => t !== tag));
	}

	function handleSaveDefaultBranch() {
		setBranchError(null);
		setBranchSuccess(null);
		startBranchTransition(async () => {
			const result = await updateDefaultBranch(owner, repo, defaultBranch);
			if (result.success) {
				setBranchSuccess("Default branch updated");
				router.refresh();
			} else {
				setBranchError(result.error ?? "Failed to update");
			}
		});
	}

	function handleSaveFeatures() {
		setFeaturesError(null);
		setFeaturesSuccess(null);
		startFeaturesTransition(async () => {
			const result = await updateRepoSettings(owner, repo, features);
			if (result.success) {
				setFeaturesSuccess("Features updated");
				router.refresh();
			} else {
				setFeaturesError(result.error ?? "Failed to update");
			}
		});
	}

	function handleSaveMerge() {
		setMergeError(null);
		setMergeSuccess(null);
		startMergeTransition(async () => {
			const result = await updateRepoSettings(owner, repo, mergeSettings);
			if (result.success) {
				setMergeSuccess("Merge settings updated");
				router.refresh();
			} else {
				setMergeError(result.error ?? "Failed to update");
			}
		});
	}

	function handleArchive() {
		if (!confirmArchive) {
			setConfirmArchive(true);
			return;
		}
		setDangerError(null);
		startDangerTransition(async () => {
			const result = await archiveRepository(owner, repo);
			if (result.success) {
				router.refresh();
			} else {
				setDangerError(result.error ?? "Failed to archive");
			}
		});
	}

	function handleDelete() {
		setDangerError(null);
		startDangerTransition(async () => {
			const result = await deleteRepository(owner, repo);
			if (result.success) {
				router.push("/dashboard");
			} else {
				setDangerError(result.error ?? "Failed to delete");
			}
		});
	}

	const generalHasChanges =
		name !== repoData.name ||
		description !== (repoData.description ?? "") ||
		homepage !== (repoData.homepage ?? "") ||
		(visibility === "private") !== repoData.private;

	const topicsHasChanges = JSON.stringify(topics) !== JSON.stringify(repoData.topics);

	const branchHasChanges = defaultBranch !== repoData.default_branch;

	const featuresHasChanges =
		features.has_wiki !== repoData.has_wiki ||
		features.has_issues !== repoData.has_issues ||
		features.has_projects !== repoData.has_projects ||
		features.has_discussions !== repoData.has_discussions;

	const mergeHasChanges =
		mergeSettings.allow_merge_commit !== repoData.allow_merge_commit ||
		mergeSettings.allow_squash_merge !== repoData.allow_squash_merge ||
		mergeSettings.allow_rebase_merge !== repoData.allow_rebase_merge ||
		mergeSettings.delete_branch_on_merge !== repoData.delete_branch_on_merge;

	return (
		<div className="space-y-3 pb-8">
			{/* ── General ── */}
			<SectionCard>
				<SectionHeader
					icon={Settings}
					title="General"
					description="Basic repository information and visibility"
				/>
				<div className="space-y-3.5">
					<div>
						<label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 block">
							Repository name
						</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							disabled={isArchived}
							className="w-full max-w-sm bg-transparent border border-border/40 rounded-md px-3 py-2 text-sm focus:border-foreground/20 focus:outline-none transition-colors disabled:opacity-50"
						/>
					</div>
					<div>
						<label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 block">
							Description
						</label>
						<textarea
							value={description}
							onChange={(e) =>
								setDescription(e.target.value)
							}
							disabled={isArchived}
							rows={2}
							className="w-full bg-transparent border border-border/40 rounded-md px-3 py-2 text-sm focus:border-foreground/20 focus:outline-none transition-colors resize-none disabled:opacity-50"
						/>
					</div>
					<div>
						<label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 block">
							Homepage URL
						</label>
						<div className="relative max-w-sm">
							<Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/25" />
							<input
								type="url"
								value={homepage}
								onChange={(e) =>
									setHomepage(e.target.value)
								}
								disabled={isArchived}
								placeholder="https://example.com"
								className="w-full bg-transparent border border-border/40 rounded-md pl-8 pr-3 py-2 text-sm focus:border-foreground/20 focus:outline-none transition-colors placeholder:text-muted-foreground/20 disabled:opacity-50"
							/>
						</div>
					</div>

					{/* Visibility */}
					<div>
						<label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 block">
							Visibility
						</label>
						<div className="flex items-center gap-1.5">
							<button
								type="button"
								disabled={isArchived}
								onClick={() => {
									setVisibility("public");
									setConfirmVisibility(false);
								}}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-all cursor-pointer",
									visibility === "public"
										? "border-foreground/15 bg-foreground/[0.06] text-foreground font-medium"
										: "border-border/30 text-muted-foreground/50 hover:border-border/50 hover:text-muted-foreground/70",
									isArchived &&
										"opacity-50 cursor-not-allowed",
								)}
							>
								<Eye className="w-3 h-3" />
								Public
							</button>
							<span className="w-px h-4 bg-border/30" />
							<button
								type="button"
								disabled={isArchived}
								onClick={() => {
									setVisibility("private");
									setConfirmVisibility(false);
								}}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-all cursor-pointer",
									visibility === "private"
										? "border-foreground/15 bg-foreground/[0.06] text-foreground font-medium"
										: "border-border/30 text-muted-foreground/50 hover:border-border/50 hover:text-muted-foreground/70",
									isArchived &&
										"opacity-50 cursor-not-allowed",
								)}
							>
								<EyeOff className="w-3 h-3" />
								Private
							</button>
						</div>
						{confirmVisibility && (
							<div className="mt-2.5 flex items-start gap-2 rounded-md bg-amber-500/[0.07] border border-dashed border-amber-500/20 px-3 py-2.5">
								<AlertTriangle className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
								<p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 leading-relaxed">
									Changing visibility will
									affect who can access this
									repository. Click save again
									to confirm.
								</p>
							</div>
						)}
					</div>
				</div>
				<SaveFooter
					onClick={handleSaveGeneral}
					pending={generalPending}
					disabled={!generalHasChanges || isArchived}
					error={generalError}
					success={generalSuccess}
				/>
			</SectionCard>

			{/* ── Social Preview (public repos only) ── */}
			{!repoData.private && (
				<SectionCard dashed>
					<div className="flex items-center gap-4">
						<div className="w-32 shrink-0 rounded border border-border/25 overflow-hidden bg-muted/20 dark:bg-white/[0.015]">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={`https://opengraph.githubassets.com/1/${owner}/${repo}`}
								alt={`Social preview for ${owner}/${repo}`}
								className="w-full aspect-[2/1] object-cover"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-xs font-medium text-foreground/85">
								Social Preview
							</p>
							<p className="text-[10px] text-muted-foreground mt-0.5">
								Customize the image shown when
								shared on social media
							</p>
							<a
								href={`https://github.com/${owner}/${repo}/settings`}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 mt-2 text-[11px] text-muted-foreground/50 hover:text-foreground/70 transition-colors"
							>
								<ExternalLink className="w-3 h-3" />
								Edit on GitHub
							</a>
						</div>
					</div>
				</SectionCard>
			)}

			{/* ── Topics ── */}
			<SectionCard dashed>
				<SectionHeader
					icon={Hash}
					title="Topics"
					description="Help people find your repository"
				/>
				<div
					className={cn(
						"flex flex-wrap items-center gap-1.5 min-h-[38px] rounded-md border border-border/30 bg-muted/20 dark:bg-white/[0.015] px-2.5 py-2 transition-colors",
						!isArchived &&
							"focus-within:border-foreground/20 focus-within:bg-transparent",
					)}
					onClick={() => topicInputRef.current?.focus()}
				>
					{topics.map((tag) => (
						<span
							key={tag}
							className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] border border-foreground/[0.08] px-2.5 py-0.5 text-[11px] font-mono text-foreground/70 transition-colors hover:border-foreground/15 hover:text-foreground/85"
						>
							{tag}
							{!isArchived && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										removeTopic(tag);
									}}
									className="text-muted-foreground/30 hover:text-foreground/60 rounded-full transition-colors cursor-pointer"
								>
									<X className="w-3 h-3" />
								</button>
							)}
						</span>
					))}
					{!isArchived && (
						<input
							ref={topicInputRef}
							type="text"
							value={topicInput}
							onChange={(e) =>
								setTopicInput(e.target.value)
							}
							onKeyDown={(e) => {
								if (
									e.key === "Enter" ||
									e.key === "," ||
									e.key === " "
								) {
									e.preventDefault();
									addTopic(topicInput);
								}
								if (
									e.key === "Backspace" &&
									!topicInput &&
									topics.length > 0
								) {
									removeTopic(
										topics[
											topics.length -
												1
										],
									);
								}
							}}
							placeholder={
								topics.length === 0
									? "Add topics..."
									: ""
							}
							className="bg-transparent border-none text-xs focus:outline-none placeholder:text-muted-foreground/25 min-w-[60px] flex-1"
						/>
					)}
				</div>
				<SaveFooter
					onClick={handleSaveTopics}
					pending={topicsPending}
					disabled={!topicsHasChanges || isArchived}
					error={topicsError}
					success={topicsSuccess}
				/>
			</SectionCard>

			{/* ── Default Branch ── */}
			<SectionCard>
				<SectionHeader
					icon={GitBranch}
					title="Default Branch"
					description="The default branch for pull requests and code display"
				/>
				<div className="relative w-full max-w-xs">
					<button
						type="button"
						disabled={isArchived}
						onClick={() =>
							setBranchDropdownOpen(!branchDropdownOpen)
						}
						className={cn(
							"w-full flex items-center gap-2 rounded-md border border-border/40 px-3 py-2 text-sm transition-all cursor-pointer",
							branchDropdownOpen &&
								"border-foreground/20 shadow-sm",
							isArchived &&
								"opacity-50 cursor-not-allowed",
						)}
					>
						<GitBranch className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
						<span className="font-mono text-xs flex-1 text-left text-foreground/80">
							{defaultBranch}
						</span>
						<ChevronDown
							className={cn(
								"w-3.5 h-3.5 text-muted-foreground/30 transition-transform duration-200",
								branchDropdownOpen && "rotate-180",
							)}
						/>
					</button>
					{branchDropdownOpen && (
						<div className="absolute z-10 mt-1.5 w-full rounded-md border border-border/40 bg-background shadow-lg max-h-48 overflow-y-auto">
							{branches.map((b, i) => (
								<button
									key={b}
									type="button"
									onClick={() => {
										setDefaultBranch(b);
										setBranchDropdownOpen(
											false,
										);
									}}
									className={cn(
										"w-full flex items-center gap-2 text-left px-3 py-2 text-xs transition-colors cursor-pointer",
										"hover:bg-muted/40 dark:hover:bg-white/[0.03]",
										b ===
											defaultBranch &&
											"bg-foreground/[0.04]",
										i !==
											branches.length -
												1 &&
											"border-b border-border/15",
									)}
								>
									<GitBranch className="w-3 h-3 text-muted-foreground/25 shrink-0" />
									<span
										className={cn(
											"font-mono",
											b ===
												defaultBranch
												? "text-foreground/90 font-medium"
												: "text-foreground/60",
										)}
									>
										{b}
									</span>
									{b === defaultBranch && (
										<Check className="w-3 h-3 text-emerald-500/70 ml-auto shrink-0" />
									)}
								</button>
							))}
						</div>
					)}
				</div>
				<SaveFooter
					onClick={handleSaveDefaultBranch}
					pending={branchPending}
					disabled={!branchHasChanges || isArchived}
					error={branchError}
					success={branchSuccess}
				/>
			</SectionCard>

			{/* ── Features & Merge side-by-side on larger screens ── */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
				{/* Features */}
				<SectionCard>
					<SectionHeader
						icon={Layers}
						title="Features"
						description="Toggle repository capabilities"
					/>
					<div className="rounded-md border border-border/25 overflow-hidden">
						{(
							[
								[
									"has_wiki",
									"Wikis",
									"Collaborative documentation pages",
								],
								[
									"has_issues",
									"Issues",
									"Track bugs and feature requests",
								],
								[
									"has_projects",
									"Projects",
									"Organize work with boards",
								],
								[
									"has_discussions",
									"Discussions",
									"Community conversations and Q&A",
								],
							] as const
						).map(([key, label, desc], i, arr) => (
							<ToggleRow
								key={key}
								label={label}
								description={desc}
								checked={features[key]}
								disabled={isArchived}
								onChange={(v) =>
									setFeatures({
										...features,
										[key]: v,
									})
								}
								last={i === arr.length - 1}
							/>
						))}
					</div>
					<SaveFooter
						onClick={handleSaveFeatures}
						pending={featuresPending}
						disabled={!featuresHasChanges || isArchived}
						error={featuresError}
						success={featuresSuccess}
					/>
				</SectionCard>

				{/* Merge Settings */}
				<SectionCard>
					<SectionHeader
						icon={GitMerge}
						title="Merge Settings"
						description="Configure pull request merge behavior"
					/>
					<div className="rounded-md border border-border/25 overflow-hidden">
						{(
							[
								[
									"allow_merge_commit",
									"Merge commits",
									"Combine all commits into one",
								],
								[
									"allow_squash_merge",
									"Squash merging",
									"Squash into a single commit",
								],
								[
									"allow_rebase_merge",
									"Rebase merging",
									"Rebase onto the base branch",
								],
								[
									"delete_branch_on_merge",
									"Auto-delete branches",
									"Delete branches after merge",
								],
							] as const
						).map(([key, label, desc], i, arr) => (
							<ToggleRow
								key={key}
								label={label}
								description={desc}
								checked={mergeSettings[key]}
								disabled={isArchived}
								onChange={(v) =>
									setMergeSettings({
										...mergeSettings,
										[key]: v,
									})
								}
								last={i === arr.length - 1}
							/>
						))}
					</div>
					<SaveFooter
						onClick={handleSaveMerge}
						pending={mergePending}
						disabled={!mergeHasChanges || isArchived}
						error={mergeError}
						success={mergeSuccess}
					/>
				</SectionCard>
			</div>

			{/* ── Danger Zone ── */}
			<SectionCard variant="danger">
				{/* subtle dot grid background */}
				<div
					className="absolute inset-0 pointer-events-none opacity-[0.035]"
					style={{
						backgroundImage:
							"radial-gradient(circle, currentColor 0.5px, transparent 0.5px)",
						backgroundSize: "16px 16px",
					}}
				/>
				<div className="relative">
					<SectionHeader
						icon={AlertTriangle}
						title="Danger Zone"
						variant="danger"
					/>

					{/* Archive */}
					<div className="rounded-md border border-dashed border-destructive/15 p-3.5 bg-destructive/[0.02]">
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-xs font-medium text-foreground/85">
									{isArchived
										? "Repository archived"
										: "Archive this repository"}
								</p>
								<p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
									{isArchived
										? "This repository is archived and read-only."
										: "Mark as archived and read-only. Can be reversed by GitHub support."}
								</p>
							</div>
							{!isArchived && (
								<div className="flex items-center gap-2 shrink-0">
									{confirmArchive && (
										<button
											onClick={() =>
												setConfirmArchive(
													false,
												)
											}
											className="text-[10px] text-muted-foreground/50 hover:text-foreground/70 transition-colors cursor-pointer"
										>
											Cancel
										</button>
									)}
									<button
										onClick={
											handleArchive
										}
										disabled={
											dangerPending
										}
										className={cn(
											"inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
											confirmArchive
												? "border-destructive bg-destructive text-white hover:bg-destructive/90 active:scale-[0.98]"
												: "border-destructive/20 text-destructive/60 hover:text-destructive/80 hover:border-destructive/35 hover:bg-destructive/[0.04]",
										)}
									>
										<Archive className="w-3 h-3" />
										{confirmArchive
											? "Confirm"
											: "Archive"}
									</button>
								</div>
							)}
						</div>
					</div>

					{/* Divider */}
					<div className="my-3 border-t border-dashed border-destructive/10" />

					{/* Delete */}
					<div className="rounded-md border border-dashed border-destructive/15 p-3.5 bg-destructive/[0.02]">
						<p className="text-xs font-medium text-foreground/85">
							Delete this repository
						</p>
						<p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
							Once deleted, there is no going back. This
							action is permanent.
						</p>
						<div className="mt-3 space-y-2.5">
							<label className="text-[10px] text-muted-foreground/50 block">
								Type{" "}
								<code className="font-mono text-foreground/70 bg-foreground/[0.05] border border-border/30 px-1.5 py-0.5 rounded text-[10px]">
									{owner}/{repo}
								</code>{" "}
								to confirm
							</label>
							<div className="flex items-center gap-2 max-w-lg">
								<input
									type="text"
									value={deleteConfirmName}
									onChange={(e) =>
										setDeleteConfirmName(
											e.target
												.value,
										)
									}
									placeholder={`${owner}/${repo}`}
									className="flex-1 min-w-0 bg-transparent border border-border/30 rounded-md px-3 py-1.5 text-xs font-mono focus:border-destructive/30 focus:outline-none transition-colors placeholder:text-muted-foreground/15"
								/>
								<button
									onClick={handleDelete}
									disabled={
										deleteConfirmName !==
											`${owner}/${repo}` ||
										dangerPending
									}
									className={cn(
										"inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0",
										deleteConfirmName ===
											`${owner}/${repo}`
											? "border-destructive bg-destructive text-white hover:bg-destructive/90 active:scale-[0.98]"
											: "bg-muted/30 border-border/30 text-muted-foreground/20 cursor-not-allowed",
									)}
								>
									<Trash2 className="w-3 h-3" />
									Delete this repository
								</button>
							</div>
						</div>
					</div>

					{dangerError && (
						<div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/[0.07] border border-dashed border-destructive/20 px-3 py-2.5">
							<AlertTriangle className="w-3.5 h-3.5 text-destructive/70 shrink-0" />
							<span className="text-[11px] text-destructive/80">
								{dangerError}
							</span>
						</div>
					)}
				</div>
			</SectionCard>
		</div>
	);
}
