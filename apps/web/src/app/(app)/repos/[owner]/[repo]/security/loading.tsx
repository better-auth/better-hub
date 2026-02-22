export default function SecurityLoading() {
	return (
		<div className="animate-pulse space-y-4">
			{/* Security policy */}
			<div className="border border-border/40 rounded-md p-4">
				<div className="h-4 w-28 rounded bg-muted/40 mb-3" />
				<div className="space-y-2">
					<div className="h-3 w-full rounded bg-muted/25" />
					<div className="h-3 w-5/6 rounded bg-muted/25" />
					<div className="h-3 w-3/4 rounded bg-muted/25" />
				</div>
			</div>

			{/* Vulnerability alerts */}
			<div className="border border-border/40 rounded-md p-4">
				<div className="h-4 w-36 rounded bg-muted/40 mb-4" />
				<div className="space-y-3">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="flex items-center gap-3 p-3 rounded border border-border/30"
						>
							<div
								className={`h-4 w-4 rounded shrink-0 ${
									i === 0
										? "bg-red-500/30"
										: i === 1
											? "bg-yellow-500/30"
											: "bg-muted/30"
								}`}
							/>
							<div className="flex-1 space-y-1">
								<div
									className="h-3.5 rounded bg-muted/35"
									style={{
										width: `${150 + Math.random() * 200}px`,
									}}
								/>
								<div className="h-2.5 w-20 rounded bg-muted/15" />
							</div>
							<div className="h-5 w-16 rounded-full bg-muted/20 shrink-0" />
						</div>
					))}
				</div>
			</div>

			{/* Dependabot / Secret scanning */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<div className="border border-border/40 rounded-md p-4">
					<div className="h-4 w-24 rounded bg-muted/40 mb-3" />
					<div className="h-3 w-32 rounded bg-muted/20" />
				</div>
				<div className="border border-border/40 rounded-md p-4">
					<div className="h-4 w-28 rounded bg-muted/40 mb-3" />
					<div className="h-3 w-28 rounded bg-muted/20" />
				</div>
			</div>
		</div>
	);
}
