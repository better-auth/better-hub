interface IssueDetailLayoutProps {
	header: React.ReactNode;
	timeline: React.ReactNode;
	commentForm?: React.ReactNode;
	sidebar?: React.ReactNode;
}

export function IssueDetailLayout({
	header,
	timeline,
	commentForm,
	sidebar,
}: IssueDetailLayoutProps) {
	return (
		<div className="flex-1 min-h-0 flex flex-col">
			<div className="shrink-0 pt-3">{header}</div>

			<div className="flex-1 min-h-0 flex gap-6">
				{/* Main thread */}
				<div className="flex-1 min-w-0 overflow-y-auto pb-8">
					<div className="max-w-3xl">
						{/* Mobile sidebar */}
						{sidebar && (
							<div className="lg:hidden space-y-5 mb-6 pb-4 border-b border-border/40">
								{sidebar}
							</div>
						)}

						<div className="space-y-3">{timeline}</div>

						{commentForm && (
							<div className="mt-6 pt-4 border-t border-border/40">
								{commentForm}
							</div>
						)}
					</div>
				</div>

				{/* Right sidebar */}
				{sidebar && (
					<div className="hidden lg:block w-[240px] xl:w-[280px] shrink-0 border-l border-border/40 pl-6 overflow-y-auto pb-8">
						<div className="space-y-5 pt-1">{sidebar}</div>
					</div>
				)}
			</div>
		</div>
	);
}
