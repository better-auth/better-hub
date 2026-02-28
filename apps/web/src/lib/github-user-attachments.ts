const GITHUB_USER_ATTACHMENT_ASSET_URL_RE =
	/^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]+(?:\?[^\s"]*)?$/i;

export function isGitHubUserAttachmentAssetUrl(url: string): boolean {
	return GITHUB_USER_ATTACHMENT_ASSET_URL_RE.test(url.trim());
}
