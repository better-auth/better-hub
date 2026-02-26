import { Suspense } from "react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AppNavbar } from "@/components/layout/navbar";
import { GlobalChatProvider } from "@/components/shared/global-chat-provider";
import { GlobalChatPanel } from "@/components/shared/global-chat-panel";
import { NavigationProgress } from "@/components/shared/navigation-progress";
import { getServerSession } from "@/lib/auth";
import { getNotifications, checkIsStarred } from "@/lib/github";
import { type GhostTabState } from "@/lib/chat-store";
import type { NotificationItem } from "@/lib/github-types";
import { ColorThemeProvider } from "@/components/theme/theme-provider";
import { CodeThemeProvider } from "@/components/theme/code-theme-provider";
import { GitHubLinkInterceptor } from "@/components/shared/github-link-interceptor";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MutationEventProvider } from "@/components/shared/mutation-event-provider";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { OnboardingOverlay } from "@/components/onboarding/onboarding-overlay";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const session = await getServerSession();
	if (!session) {
		const headersList = await headers();
		const pathname = headersList.get("x-pathname") || "";
		const redirectTo =
			pathname && pathname !== "/"
				? `/?redirect=${encodeURIComponent(pathname)}`
				: "/";
		return redirect(redirectTo);
	}

	const notifications = (await getNotifications(20)) as NotificationItem[];

	const onboardingDone = session?.user?.onboardingDone ?? false;
	const [initialStarredAuth, initialStarredHub] = onboardingDone
		? [false, false]
		: await Promise.all([
				checkIsStarred("better-auth", "better-auth"),
				checkIsStarred("better-auth", "better-hub"),
			]);

	const freshTabId = crypto.randomUUID();
	const initialTabState: GhostTabState = {
		tabs: [{ id: freshTabId, label: "New chat" }],
		activeTabId: freshTabId,
		counter: 1,
	};

	return (
		<NuqsAdapter>
			<HotkeysProvider>
				<GlobalChatProvider initialTabState={initialTabState}>
					<MutationEventProvider>
						<ColorThemeProvider>
							<CodeThemeProvider>
								<GitHubLinkInterceptor>
									<TooltipProvider>
										<NavigationProgress />
										<div className="flex flex-col h-dvh overflow-y-auto lg:overflow-hidden">
											<AppNavbar
												session={
													session
												}
												notifications={
													notifications
												}
											/>
											<div className="mt-10 lg:h-[calc(100dvh-var(--spacing)*10)] flex flex-col px-2 sm:px-4 pt-2 lg:overflow-auto">
												{
													children
												}
											</div>
											<Suspense>
												<GlobalChatPanel />
											</Suspense>
										</div>
										<OnboardingOverlay
											userName={
												session
													?.githubUser
													?.name ||
												session
													?.githubUser
													?.login ||
												""
											}
											userAvatar={
												session
													?.githubUser
													?.avatar_url ||
												""
											}
											bio={
												session
													?.githubUser
													?.bio ||
												""
											}
											company={
												session
													?.githubUser
													?.company ||
												""
											}
											location={
												session
													?.githubUser
													?.location ||
												""
											}
											publicRepos={
												session
													?.githubUser
													?.public_repos ??
												0
											}
											followers={
												session
													?.githubUser
													?.followers ??
												0
											}
											createdAt={
												session
													?.githubUser
													?.created_at ||
												""
											}
											onboardingDone={
												onboardingDone
											}
											initialStarredAuth={
												initialStarredAuth
											}
											initialStarredHub={
												initialStarredHub
											}
										/>
									</TooltipProvider>
								</GitHubLinkInterceptor>
							</CodeThemeProvider>
						</ColorThemeProvider>
					</MutationEventProvider>
				</GlobalChatProvider>
			</HotkeysProvider>
		</NuqsAdapter>
	);
}
