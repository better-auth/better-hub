"use client";

import type { ReactNode } from "react";
import { Component } from "react";

type Props = {
	children: ReactNode;
};

type State = {
	hasError: boolean;
};

export class UserProfileActivityTimelineBoundary extends Component<Props, State> {
	override state: State = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	override componentDidCatch() {}

	override render() {
		if (this.state.hasError) {
			return (
				<section className="relative isolate border border-border rounded-md bg-card/50 p-4">
					<h2 className="text-sm font-medium">Activity Timeline</h2>
					<p className="text-[11px] text-muted-foreground font-mono mt-1">
						Activity timeline is temporarily unavailable.
					</p>
				</section>
			);
		}
		return this.props.children;
	}
}
