import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export async function GET() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const account = await prisma.account.findFirst({
		where: { userId: session.user.id, providerId: "github" },
		select: { scope: true },
	});

	const scopes = account?.scope ? account.scope.split(",").filter(Boolean) : [];

	return Response.json({ scopes });
}
