"use client";

import { useState, useEffect } from "react";
import { formatDuration } from "@/lib/utils";
import { subscribeLiveTick } from "@/lib/live-tick";

interface LiveDurationProps {
	startedAt: string | null;
	completedAt?: string | null;
	className?: string;
}

export function LiveDuration({ startedAt, completedAt, className }: LiveDurationProps) {
	// tick forces re-renders when subscribeLiveTick fires; value is unused in render
	const [, setTick] = useState(0);

	useEffect(() => {
		if (!startedAt || completedAt != null) return;
		setTick(0);
		return subscribeLiveTick(() => setTick((t) => t + 1));
	}, [startedAt, completedAt]);

	if (!startedAt) return null;

	const formatted = formatDuration(startedAt, completedAt ?? null);

	return (
		<span className={className} suppressHydrationWarning>
			{formatted}
		</span>
	);
}
