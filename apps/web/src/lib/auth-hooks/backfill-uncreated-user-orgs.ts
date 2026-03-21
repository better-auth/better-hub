import type { GenericEndpointContext, Session, User } from "better-auth";
import { prisma } from "../db";
import { createDefaultOrganization } from "./create-default-user-org";

export const backfillUncreatedUserOrgs = async (
	overwriteUser: (User & { githubLogin: string }) | null,
	ctx: GenericEndpointContext,
) => {
	// This hook is used to backfill the user's organizations who signed up before the organizations were added.
	if (ctx.path !== "/get-session") return;
	const returned =
		overwriteUser ??
		(ctx.context.returned as
			| { session: Session; user: User & { githubLogin: string } }
			| undefined);
	if (!returned || !("session" in returned)) return;
	if (!returned.user.githubLogin) return;

	const organization = await prisma.organization.findFirst({
		where: {
			slug: returned.user.githubLogin,
		},
		select: {
			id: true,
		},
	});
	if (!organization) {
		await createDefaultOrganization(returned.user);
	}
};
