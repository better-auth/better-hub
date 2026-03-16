import { getToken } from "./config.js";

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export function requireAuth(): string {
	const token = getToken();
	if (!token) {
		throw new ApiError(401, "Not logged in. Run `better-hub auth login` first.");
	}
	return token;
}
