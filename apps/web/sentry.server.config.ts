// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const SENSITIVE_PATTERNS = /authorization|cookie|token|secret|password|pat|apikey|api_key/i;

Sentry.init({
	dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

	tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1,

	enableLogs: true,

	sendDefaultPii: false,

	beforeSend(event) {
		if (event.request?.headers) {
			for (const key of Object.keys(event.request.headers)) {
				if (SENSITIVE_PATTERNS.test(key)) {
					event.request.headers[key] = "[REDACTED]";
				}
			}
		}
		if (event.request?.cookies) {
			event.request.cookies = {};
		}
		return event;
	},
});
