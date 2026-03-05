import { Lock, Globe, Archive, GitFork, LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RepoBadgeProps {
	type: "private" | "public" | "archived" | "fork" | "website";
	href?: string;
	style?: "solid" | "dashed";
}

const badgeConfig = {
	private: {
		icon: Lock,
		label: "Private",
		className: "border-border text-muted-foreground/60",
	},
	public: {
		icon: Globe,
		label: "Public",
		className: "border-border text-muted-foreground/60",
	},
	archived: {
		icon: Archive,
		label: "Archived",
		className: "border-warning/30 text-warning",
	},
	fork: {
		icon: GitFork,
		label: "Fork",
		className: "border-border text-muted-foreground/60",
	},
	website: {
		icon: LinkIcon,
		label: "Website",
		className: "border-border text-muted-foreground/60 hover:text-foreground transition-colors",
	},
};

export function RepoBadge({ type, href, style = "solid" }: RepoBadgeProps) {
	const config = badgeConfig[type];
	const Icon = config.icon;

	const baseClassName = cn(
		"flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 border rounded-sm",
		style === "dashed" && "border-dashed",
		config.className,
	);

	const content = (
		<>
			<Icon className="w-2.5 h-2.5" />
			{config.label}
		</>
	);

	if (href) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={baseClassName}
			>
				{content}
			</a>
		);
	}

	return <span className={baseClassName}>{content}</span>;
}
