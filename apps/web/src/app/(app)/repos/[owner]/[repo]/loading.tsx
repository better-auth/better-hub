export default function RepoLoading() {
	return (
		<div className="animate-pulse space-y-4">
			<div className="h-4 w-48 rounded bg-muted" />
			<div className="space-y-3">
				<div className="h-3 w-full rounded bg-muted/60" />
				<div className="h-3 w-5/6 rounded bg-muted/60" />
				<div className="h-3 w-4/6 rounded bg-muted/60" />
			</div>
			<div className="space-y-3 pt-2">
				<div className="h-3 w-full rounded bg-muted/60" />
				<div className="h-3 w-3/4 rounded bg-muted/60" />
				<div className="h-3 w-5/6 rounded bg-muted/60" />
			</div>
		</div>
	);
}
