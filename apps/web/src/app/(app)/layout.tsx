import { Suspense } from "react";
import { AppNavbar } from "@/components/layout/navbar";
import { GlobalChatProvider } from "@/components/shared/global-chat-provider";
import { GlobalChatPanel } from "@/components/shared/global-chat-panel";
import { NavigationProgress } from "@/components/shared/navigation-progress";
import { getServerSession } from "@/lib/auth";
import { type GhostTabState } from "@/lib/chat-store";
import { ColorThemeProvider } from "@/components/theme/theme-provider";
import { CodeThemeProvider } from "@/components/theme/code-theme-provider";
import { GitHubLinkInterceptor } from "@/components/shared/github-link-interceptor";
import { MutationEventProvider } from "@/components/shared/mutation-event-provider";
import { redirect } from "next/navigation";
import { OnboardingOverlay } from "@/components/onboarding/onboarding-overlay";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const session = await getServerSession();
	if (!session) return redirect("/");

	const freshTabId = crypto.randomUUID();
	const initialTabState: GhostTabState = {
		tabs: [{ id: freshTabId, label: "New chat" }],
		activeTabId: freshTabId,
		counter: 1,
	};

	return (
		<GlobalChatProvider initialTabState={initialTabState}>
			<MutationEventProvider>
				<ColorThemeProvider>
					<CodeThemeProvider>
						<GitHubLinkInterceptor>
							<NavigationProgress />
							<div className="flex flex-col h-dvh overflow-y-auto lg:overflow-hidden">
								<AppNavbar session={session} />
								<div className="mt-10 lg:h-[calc(100dvh-var(--spacing)*10)] flex flex-col px-2 sm:px-4 pt-2 lg:overflow-auto">
									{children}
								</div>
								<Suspense>
									<GlobalChatPanel />
								</Suspense>
							</div>
							<OnboardingOverlay
								userName={
									session?.githubUser?.name ||
									session?.githubUser
										?.login ||
									""
								}
								userAvatar={
									session?.githubUser
										?.avatar_url || ""
								}
								bio={session?.githubUser?.bio || ""}
								company={
									session?.githubUser
										?.company || ""
								}
								location={
									session?.githubUser
										?.location || ""
								}
								publicRepos={
									session?.githubUser
										?.public_repos ?? 0
								}
								followers={
									session?.githubUser
										?.followers ?? 0
								}
								createdAt={
									session?.githubUser
										?.created_at || ""
								}
								onboardingDone={
									session?.user
										?.onboardingDone ??
									false
								}
							/>
						</GitHubLinkInterceptor>
					</CodeThemeProvider>
				</ColorThemeProvider>
			</MutationEventProvider>
		</GlobalChatProvider>
	);
}
