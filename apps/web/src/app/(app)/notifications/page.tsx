import type { Metadata } from "next";
import { getNotifications } from "@/lib/github";
import { NotificationsContent } from "@/components/notifications/notifications-content";

export const metadata: Metadata = {
	title: "Notifications",
};

export default async function NotificationsPage() {
	const notifications = await getNotifications(50);
	return (
		<NotificationsContent
			notifications={
				notifications as Array<{
					id: string;
					reason: string;
					subject: {
						title: string;
						type: string;
						url: string | null;
					};
					repository: { full_name: string; html_url: string };
					updated_at: string;
					unread: boolean;
				}>
			}
		/>
	);
}
