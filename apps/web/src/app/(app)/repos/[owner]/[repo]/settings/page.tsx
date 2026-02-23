import type { Metadata } from "next";
import { Settings } from "lucide-react";

export const metadata: Metadata = {
	title: "Settings",
};

export default function SettingsPage() {
	return (
		<div className="py-16 text-center">
			<Settings className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
			<h2 className="text-sm font-medium text-muted-foreground/70">Settings</h2>
			<p className="text-xs text-muted-foreground/50 font-mono mt-1">
				Repository settings will appear here
			</p>
		</div>
	);
}
