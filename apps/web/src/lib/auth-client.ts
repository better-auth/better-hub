import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, deviceAuthorizationClient } from "better-auth/client/plugins";
import { auth } from "./auth";
import { dashClient, sentinelClient } from "@better-auth/infra/client";
import { stripeClient } from "@better-auth/stripe/client";
import { storageClient } from "@better-hub/storage/client";

export const authClient = createAuthClient({
	plugins: [
		inferAdditionalFields<typeof auth>(),
		dashClient(),
		sentinelClient(),
		//@ts-expect-error - better-auth type issues
		stripeClient({ subscription: true }),
		deviceAuthorizationClient(),
		storageClient(),
	],
});

export const { signIn, signOut, useSession } = authClient;
