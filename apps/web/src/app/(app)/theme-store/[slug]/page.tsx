import type { Metadata } from "next";
import { ThemeDetail } from "@/components/theme-store/theme-detail";

export const metadata: Metadata = {
	title: "Theme StoreDetails",
};

export default async function ThemeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	return <ThemeDetail slug={slug} />;
}
