import type { Metadata } from "next";
import { ThemeStoreBrowse } from "@/components/theme-store/theme-store-browse";

export const metadata: Metadata = {
	title: "Theme Store",
};

export default function ThemeStorePage() {
	return <ThemeStoreBrowse />;
}
