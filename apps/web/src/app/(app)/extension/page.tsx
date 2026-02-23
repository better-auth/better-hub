import type { Metadata } from "next";
import { ExtensionPageContent } from "@/components/extension/extension-page-content";

export const metadata: Metadata = {
	title: "Browser Extension",
};

export default function ExtensionPage() {
	return <ExtensionPageContent />;
}
