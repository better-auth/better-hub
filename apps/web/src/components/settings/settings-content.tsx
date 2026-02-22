"use client";

import { useState } from "react";
import { Settings, Bot, CreditCard, User, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GeneralTab } from "./tabs/general-tab";
import { AIModelTab } from "./tabs/ai-model-tab";
import { BillingTab } from "./tabs/billing-tab";
import { AccountTab } from "./tabs/account-tab";
import { EditorTab } from "./tabs/editor-tab";
import type { UserSettings } from "@/lib/user-settings-store";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

const TABS = [
	{ id: "general", label: "General", icon: Settings },
	{ id: "editor", label: "Editor", icon: Code2 },
	{ id: "ai", label: "AI / Model", icon: Bot },
	{ id: "billing", label: "Billing", icon: CreditCard },
	{ id: "account", label: "Account", icon: User },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface SettingsContentProps {
	initialSettings: UserSettings;
	user: { name: string; email: string; image: string | null };
}

export function SettingsContent({ initialSettings, user }: SettingsContentProps) {
	const [activeTab, setActiveTab] = useState<TabId>("general");
	const [settings, setSettings] = useState(initialSettings);
	const { emit } = useMutationEvents();

	async function handleUpdate(updates: Partial<UserSettings>) {
		const res = await fetch("/api/user-settings", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updates),
		});
		if (res.ok) {
			const updated = await res.json();
			setSettings(updated);
			emit({ type: "settings:updated" });
		}
	}

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Header */}
			<div className="shrink-0 mb-4">
				<h1 className="text-xl font-medium tracking-tight">Settings</h1>
				<p className="text-[11px] text-muted-foreground font-mono mt-1">
					Manage your preferences, AI model configuration, and
					account.
				</p>
			</div>

			{/* Tab bar */}
			<div className="shrink-0 flex items-center border border-border mb-0 overflow-x-auto no-scrollbar">
				{TABS.map(({ id, label, icon: Icon }) => (
					<button
						key={id}
						onClick={() => setActiveTab(id)}
						className={cn(
							"flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors cursor-pointer",
							activeTab === id
								? "text-foreground bg-muted/50 dark:bg-white/[0.04]"
								: "text-muted-foreground hover:text-foreground/60",
						)}
					>
						<Icon className="w-3 h-3" />
						{label}
					</button>
				))}
			</div>

			{/* Content */}
			<div className="flex-1 min-h-0 border border-t-0 border-border">
				{activeTab === "general" && (
					<GeneralTab settings={settings} onUpdate={handleUpdate} />
				)}
				{activeTab === "editor" && <EditorTab />}
				{activeTab === "ai" && (
					<AIModelTab settings={settings} onUpdate={handleUpdate} />
				)}
				{activeTab === "billing" && <BillingTab />}
				{activeTab === "account" && (
					<AccountTab
						user={user}
						settings={settings}
						onUpdate={handleUpdate}
					/>
				)}
			</div>
		</div>
	);
}
