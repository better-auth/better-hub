export interface ScopeGroup {
	id: string;
	label: string;
	description: string;
	reason: string;
	scopes: string[];
	required?: boolean;
	defaultOn?: boolean;
}

export const SCOPE_GROUPS: ScopeGroup[] = [
	{
		id: "profile",
		label: "Profile & email",
		description: "Account info, email, and follow",
		reason: "Required to create your account and display your profile.",
		scopes: ["user", "user:email", "user:follow"],
		required: true,
	},
	{
		id: "public_repos",
		label: "Public repos",
		description: "Access to public repositories",
		reason: "Required to browse, view, and interact with public repositories.",
		scopes: [
			"public_repo",
			"repo:status",
			"repo_deployment",
			// https://github.com/better-auth/better-hub/issues/49
			"read:org",
		],
		required: true,
	},
	{
		id: "private_repos",
		label: "Private repos",
		description: "Access to private repositories",
		reason: "Lets you browse, edit, and manage your private repositories. Without this, only public repos are visible.",
		scopes: ["repo"],
		defaultOn: true,
	},
	{
		id: "orgs",
		label: "Organizations",
		description: "Manage org memberships",
		reason: "Lets you see and switch between your organizations and their repositories.",
		scopes: ["admin:org", "write:org", "read:org"],
		defaultOn: true,
	},
	{
		id: "notifications",
		label: "Notifications",
		description: "Access your notifications",
		reason: "Lets you view and manage your GitHub notifications directly in the app.",
		scopes: ["notifications"],
		defaultOn: true,
	},
	{
		id: "workflow",
		label: "Actions & workflows",
		description: "CI/CD and workflow runs",
		reason: "Lets you view CI/CD status and trigger workflow runs from the app.",
		scopes: ["workflow"],
		defaultOn: true,
	},
	{
		id: "projects",
		label: "Projects",
		description: "Read & write project boards",
		reason: "Lets you view and manage GitHub Projects linked to your repositories.",
		scopes: ["read:project", "write:project"],
		defaultOn: true,
	},
	{
		id: "discussions",
		label: "Discussions",
		description: "Read & write discussions",
		reason: "Lets you participate in repository and organization discussions.",
		scopes: ["write:discussion", "read:discussion"],
		defaultOn: true,
	},
	{
		id: "security",
		label: "Security",
		description: "Security events and audit logs",
		reason: "Lets you view security alerts, Dependabot findings, and audit logs.",
		scopes: ["security_events", "read:audit_log"],
		defaultOn: true,
	},
	{
		id: "gpg",
		label: "GPG keys",
		description: "Manage GPG signing keys",
		reason: "Lets you manage GPG keys used for commit signature verification.",
		scopes: ["admin:gpg_key", "write:gpg_key", "read:gpg_key"],
	},
	{
		id: "webhooks",
		label: "Webhooks",
		description: "Manage repo and org webhooks",
		reason: "Enables real-time live updates when PRs, issues, or pushes happen on your repos.",
		scopes: ["admin:repo_hook", "write:repo_hook", "read:repo_hook", "admin:org_hook"],
	},
	{
		id: "gists",
		label: "Gists",
		description: "Create and read gists",
		reason: "Lets you create, view, and manage your GitHub Gists.",
		scopes: ["gist"],
	},
];

/** Given a flat list of scope strings, return the set of group IDs that are fully covered. */
export function scopesToGroupIds(scopes: string[]): Set<string> {
	const scopeSet = new Set(scopes);
	const groupIds = new Set<string>();
	for (const group of SCOPE_GROUPS) {
		if (group.scopes.some((s) => scopeSet.has(s))) {
			groupIds.add(group.id);
		}
	}
	return groupIds;
}
