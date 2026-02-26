import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { auth } from "./auth";
import { dashClient, sentinelClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
	plugins: [inferAdditionalFields<typeof auth>(), dashClient(), sentinelClient()],
});

export const { signIn, signOut, useSession } = authClient;
