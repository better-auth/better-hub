interface CommentPermissionInput {
	authorLogin?: string | null;
	currentUserLogin?: string | null;
	viewerHasWriteAccess?: boolean;
}

export function canManageComment({
	authorLogin,
	currentUserLogin,
	viewerHasWriteAccess = false,
}: CommentPermissionInput): boolean {
	if (!currentUserLogin) return false;
	return viewerHasWriteAccess || currentUserLogin === authorLogin;
}
