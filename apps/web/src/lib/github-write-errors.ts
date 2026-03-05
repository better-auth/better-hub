function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}

export function getGitHubWriteErrorMessage(error: unknown): string {
	const message = getErrorMessage(error);
	if (!message.includes("OAuth App access restrictions")) {
		return message;
	}

	const match = message.match(/the `([^`]+)` organization/i);
	const org = match?.[1] ?? "this organization";

	return `GitHub blocked this write because ${org} has OAuth App access restrictions. Ask an org admin to approve Better Hub, or sign in with a GitHub Personal Access Token in Better Hub and try again.`;
}
