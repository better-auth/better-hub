import type { Metadata } from "next";
import { ExtensionDetail } from "@/components/theme-store/extension-detail";

export const metadata: Metadata = {
	title: "Extension Details",
};

export default async function ExtensionDetailPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	return <ExtensionDetail slug={slug} />;
}
