"use client";

import { useState } from "react";
import { Palette, FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomThemeType } from "@/lib/theme-store-types";

const config: Record<CustomThemeType, { Icon: typeof Palette; gradient: string }> = {
	theme: {
		Icon: Palette,
		gradient: "from-violet-500/20 via-fuchsia-500/15 to-pink-500/20",
	},
	"icon-theme": {
		Icon: FolderTree,
		gradient: "from-sky-500/20 via-cyan-500/15 to-teal-500/20",
	},
};

export function DefaultExtensionIcon({
	type,
	className,
	iconClassName,
}: {
	type: CustomThemeType;
	className?: string;
	iconClassName?: string;
}) {
	const { Icon, gradient } = config[type];

	return (
		<div
			className={cn(
				"rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0",
				gradient,
				className,
			)}
		>
			<Icon className={cn("text-muted-foreground", iconClassName)} />
		</div>
	);
}

export function ExtensionIcon({
	iconUrl,
	type,
	className,
	iconClassName,
	imgClassName,
}: {
	iconUrl: string | null;
	type: CustomThemeType;
	className?: string;
	iconClassName?: string;
	imgClassName?: string;
}) {
	const [failed, setFailed] = useState(false);

	if (!iconUrl || failed) {
		return (
			<DefaultExtensionIcon
				type={type}
				className={className}
				iconClassName={iconClassName}
			/>
		);
	}

	return (
		<img
			src={iconUrl}
			alt=""
			className={cn("object-cover shrink-0", className, imgClassName)}
			onError={() => setFailed(true)}
		/>
	);
}
