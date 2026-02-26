"use client";

import { CreditCard } from "lucide-react";

export function BillingTab() {
	return (
		<div className="px-4 py-12 flex flex-col items-center text-center">
			<CreditCard className="w-5 h-5 text-muted-foreground mb-2" />
			<p className="text-xs font-mono text-muted-foreground">Coming soon</p>
			<p className="text-[10px] font-mono text-muted-foreground/50 mt-1">
				Billing and subscription management will be available in a future
				update.
			</p>
		</div>
	);
}
