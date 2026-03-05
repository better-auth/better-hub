import { serve } from "inngest/next";
import { inngest, embedContent, retryUnreportedUsage } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
	client: inngest,
	functions: [embedContent, retryUnreportedUsage],
});
