"use client";

import { cn } from "@/lib/utils";
import { useNavVisibility } from "@/components/shared/nav-visibility-provider";

export function NavAwareContent({ children }: { children: React.ReactNode }) {
	const { isNavHidden } = useNavVisibility();

	return (
		<div
			className={cn(
				"flex flex-col lg:overflow-auto overflow-x-hidden transition-[margin-top,height] duration-200 ease-out",
				isNavHidden
					? "mt-0 lg:h-dvh"
					: "mt-10 lg:h-[calc(100dvh-var(--spacing)*10)]",
			)}
		>
			{children}
		</div>
	);
}
