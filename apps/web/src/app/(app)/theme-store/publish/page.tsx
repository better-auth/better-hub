import type { Metadata } from "next";
import { PublishForm } from "@/components/theme-store/publish-form";

export const metadata: Metadata = {
	title: "Publish Extension",
};

export default function PublishPage() {
	return <PublishForm />;
}
