import { History } from "lucide-react";
import { TimeAgo } from "@/components/ui/time-ago";
import type { GistDetail } from "@/lib/github-types";

interface GistRevisionsProps {
	gist: GistDetail;
}

export function GistRevisions({ gist }: GistRevisionsProps) {
	return (
		<div className="border border-border rounded-md overflow-hidden">
			{gist.history.length > 0 ? (
				<ul className="divide-y divide-border">
					{gist.history.map((entry, index) => (
						<li key={entry.version}>
							<a
								href={`${gist.html_url}/${entry.version}`}
								data-no-github-intercept
								target="_blank"
								rel="noopener noreferrer"
								className="px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
							>
								<History className="w-4 h-4 text-muted-foreground/60 shrink-0" />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<code className="text-[11px] font-mono text-foreground">
											{entry.version.slice(
												0,
												7,
											)}
										</code>
										{index === 0 && (
											<span className="text-[10px] font-mono px-1.5 py-0.5 bg-success/10 text-success rounded">
												latest
											</span>
										)}
									</div>
									<div className="text-[11px] font-mono text-muted-foreground/70 mt-0.5">
										<TimeAgo
											date={
												entry.committed_at
											}
										/>
									</div>
								</div>
							</a>
						</li>
					))}
				</ul>
			) : (
				<div className="px-4 py-8 text-center text-sm text-muted-foreground font-mono">
					No revision history available
				</div>
			)}
		</div>
	);
}
