export default function CommitDetailLoading() {
	return (
		<div className="animate-pulse">
			{/* Commit header */}
			<div className="border border-border rounded-md p-4 mb-4">
				<div className="h-5 w-96 max-w-full rounded bg-muted/50 mb-3" />
				<div className="flex items-center gap-2">
					<div className="h-5 w-5 rounded-full bg-muted/40" />
					<div className="h-3 w-24 rounded bg-muted/30" />
					<div className="h-3 w-20 rounded bg-muted/20" />
					<div className="h-3 w-16 rounded bg-muted/20 ml-auto font-mono" />
				</div>
			</div>

			{/* Stats bar */}
			<div className="flex items-center gap-3 px-3 py-2 border border-border rounded-md mb-4 bg-muted/10">
				<div className="h-3 w-16 rounded bg-muted/30" />
				<div className="h-3 w-20 rounded bg-green-500/20" />
				<div className="h-3 w-20 rounded bg-red-500/20" />
			</div>

			{/* File diffs */}
			{Array.from({ length: 3 }).map((_, f) => (
				<div
					key={f}
					className="border border-border rounded-md overflow-hidden mb-3"
				>
					<div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
						<div className="h-2.5 w-2.5 rounded-full bg-muted/40" />
						<div className="h-3 w-48 rounded bg-muted/30" />
						<div className="flex items-center gap-2 ml-auto">
							<div className="h-3 w-6 rounded bg-green-500/20" />
							<div className="h-3 w-6 rounded bg-red-500/20" />
						</div>
					</div>
					<div className="space-y-0">
						{Array.from({ length: 8 }).map((_, i) => (
							<div
								key={i}
								className={`flex items-center gap-0 h-5 ${
									i % 5 === 2
										? "bg-green-500/5"
										: i % 5 === 4
											? "bg-red-500/5"
											: ""
								}`}
							>
								<div className="w-10 h-full bg-muted/10" />
								<div className="w-10 h-full bg-muted/10" />
								<div
									className="h-3 rounded bg-muted/15 ml-2"
									style={{
										width: `${60 + Math.random() * 250}px`,
									}}
								/>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
