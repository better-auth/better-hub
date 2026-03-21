import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient, organizationClient } from "better-auth/client/plugins";
import { getBaseUrl, getToken } from "./config.js";
import { storageClient } from "@better-hub/storage/client";

export function getAuthClient() {
	const token = getToken();
	return createAuthClient({
		baseURL: getBaseUrl(),
		plugins: [deviceAuthorizationClient(), storageClient(), organizationClient()],
		fetchOptions: token ? { headers: { authorization: `Bearer ${token}` } } : undefined,
	});
}

export const CLIENT_ID = "better-hub-cli";
