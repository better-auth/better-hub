"use client";

import { TimeAgo } from "@/components/ui/time-ago";
import { getLanguageColor } from "@/lib/github-utils";
import type { UserGist } from "@/lib/github-types";
import { ChevronRight, FileCode, MessageSquare } from "lucide-react";
import Link from "next/link";

interface UserProfileGistsProps {
	gists: UserGist[];
	ownerLogin?: string;
}

export function UserProfileGists({ gists, ownerLogin }: UserProfileGistsProps) {
	if (gists.length === 0) {
		return (
			<div className="border border-border rounded-md p-8 text-center">
				<FileCode className="w-6 h-6 text-muted-foreground/20 mx-auto mb-3" />
				<p className="text-xs text-muted-foreground/50 font-mono">
					No gists found
				</p>
			</div>
		);
	}

	return (
		<div className="border border-border rounded-md divide-y divide-border">
			{gists.map((gist) => {
				const fileCount = Object.keys(gist.files).length;
				const fileList = Object.values(gist.files);
				const firstFile = fileList[0];
				const languages = [
					...new Set(
						fileList
							.map((f) => f.language)
							.filter((l): l is string => Boolean(l)),
					),
				];

				return (
					<Link
						key={gist.id}
						href={
							ownerLogin
								? `/${ownerLogin}/gist/${gist.id}`
								: gist.html_url
						}
						className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
					>
						<FileCode className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 flex-wrap">
								<span className="text-sm text-foreground group-hover:text-foreground transition-colors font-mono leading-snug wrap-break-word">
									{gist.description ||
										firstFile?.filename ||
										"Untitled"}
								</span>
								{!gist.public && (
									<span className="px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider border border-border rounded text-muted-foreground">
										Secret
									</span>
								)}
							</div>

							{gist.description &&
								firstFile?.filename && (
									<p className="text-[11px] text-muted-foreground/60 mt-1 font-mono">
										{firstFile.filename}
									</p>
								)}

							<div className="flex items-center gap-3 mt-2 flex-wrap">
								<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
									<FileCode className="w-3 h-3" />
									{fileCount} file
									{fileCount !== 1 ? "s" : ""}
								</span>

								{gist.comments > 0 && (
									<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
										<MessageSquare className="w-3 h-3" />
										{gist.comments}
									</span>
								)}

								{languages.length > 0 && (
									<div className="flex items-center gap-1.5">
										{languages
											.slice(0, 3)
											.map(
												(
													lang,
												) => (
													<span
														key={
															lang
														}
														className="flex items-center gap-1 text-[11px] text-muted-foreground/60"
													>
														<span
															className="w-2 h-2 rounded-full"
															style={{
																backgroundColor:
																	getLanguageColor(
																		lang,
																	),
															}}
														/>
														{
															lang
														}
													</span>
												),
											)}
									</div>
								)}

								<span className="text-[11px] text-muted-foreground font-mono">
									<TimeAgo
										date={
											gist.updated_at
										}
									/>
								</span>
							</div>
						</div>
						<ChevronRight className="w-3 h-3 text-foreground/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
					</Link>
				);
			})}
		</div>
	);
}
