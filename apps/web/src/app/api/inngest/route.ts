import { serve } from "inngest/next";
import { inngest, embedContent, evaluatePRConflict, clearPRConflict, pollConflicts } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
	client: inngest,
	functions: [embedContent, evaluatePRConflict, clearPRConflict, pollConflicts],
});
