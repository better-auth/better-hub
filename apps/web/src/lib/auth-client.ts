import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { auth } from "./auth";
import { dashClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
	plugins: [inferAdditionalFields<typeof auth>(), dashClient()],
});

export const { signIn, signOut, useSession } = authClient;
