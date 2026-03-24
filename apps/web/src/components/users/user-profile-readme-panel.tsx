import { MarkdownRenderer } from "@/components/shared/markdown-renderer";

export async function UserProfileReadmePanel({
	login,
	content,
	branch,
}: {
	login: string;
	content: string;
	branch: string;
}) {
	return (
		<div className="flex-1 overflow-y-auto border border-border rounded-md overflow-hidden">
			<div className="px-4 py-2 border-b border-border bg-muted/30">
				<span className="text-[11px] font-mono text-muted-foreground">
					README.md
				</span>
			</div>
			<div className="px-6 py-5">
				<MarkdownRenderer
					content={content}
					repoContext={{
						owner: login,
						repo: login,
						branch,
					}}
				/>
			</div>
		</div>
	);
}
