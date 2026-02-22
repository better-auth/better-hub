const DEFAULT_HOST = "https://beta.better-hub.com";

// On install: just set defaults. Static rules handle the default host out of the box.
chrome.runtime.onInstalled.addListener(() => {
	chrome.storage.local.get(["enabled", "host"], (data) => {
		const enabled = data.enabled !== false;
		const host = data.host || DEFAULT_HOST;
		chrome.storage.local.set({ enabled, host });

		if (!enabled) {
			// Disable static rules if user had it off
			chrome.declarativeNetRequest.updateEnabledRulesets({
				disableRulesetIds: ["redirect_rules"],
			});
		} else if (host !== DEFAULT_HOST) {
			// Custom host — switch to dynamic rules
			switchToDynamicRules(host);
		}
		// Otherwise: static rules are already active with localhost:3000
		updateIcon(enabled);
	});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (msg.type === "toggle") {
		chrome.storage.local.get(["host"], (data) => {
			const host = data.host || DEFAULT_HOST;
			chrome.storage.local.set({ enabled: msg.enabled });

			if (msg.enabled) {
				if (host === DEFAULT_HOST) {
					// Re-enable static rules
					chrome.declarativeNetRequest.updateEnabledRulesets({
						enableRulesetIds: ["redirect_rules"],
					});
				} else {
					switchToDynamicRules(host);
				}
			} else {
				// Disable everything
				chrome.declarativeNetRequest.updateEnabledRulesets({
					disableRulesetIds: ["redirect_rules"],
				});
				clearDynamicRules();
			}

			updateIcon(msg.enabled);
			sendResponse({ ok: true });
		});
		return true;
	}

	if (msg.type === "setHost") {
		const host = msg.host.replace(/\/+$/, "");
		chrome.storage.local.set({ host });
		chrome.storage.local.get(["enabled"], (data) => {
			if (data.enabled !== false) {
				if (host === DEFAULT_HOST) {
					// Switch back to static rules
					clearDynamicRules();
					chrome.declarativeNetRequest.updateEnabledRulesets({
						enableRulesetIds: ["redirect_rules"],
					});
				} else {
					switchToDynamicRules(host);
				}
			}
			sendResponse({ ok: true });
		});
		return true;
	}
});

function switchToDynamicRules(host) {
	// Disable static, enable dynamic
	chrome.declarativeNetRequest.updateEnabledRulesets({
		disableRulesetIds: ["redirect_rules"],
	});

	chrome.declarativeNetRequest.getDynamicRules((existing) => {
		chrome.declarativeNetRequest.updateDynamicRules({
			removeRuleIds: existing.map((r) => r.id),
			addRules: buildRules(host),
		});
	});
}

function clearDynamicRules() {
	chrome.declarativeNetRequest.getDynamicRules((existing) => {
		chrome.declarativeNetRequest.updateDynamicRules({
			removeRuleIds: existing.map((r) => r.id),
		});
	});
}

function updateIcon(enabled) {
	const path = enabled ? "icons/icon" : "icons/icon-disabled";
	chrome.action
		.setIcon({
			path: { 16: `${path}-16.png`, 48: `${path}-48.png` },
		})
		.catch(() => {});
}

// GitHub-only paths that should NOT be redirected
const GITHUB_ONLY = [
	"settings",
	"marketplace",
	"explore",
	"sponsors",
	"login",
	"signup",
	"features",
	"pricing",
	"enterprise",
	"codespaces",
	"new",
	"organizations",
	"topics",
	"collections",
];

function buildRules(host) {
	const rules = [
		// --- Allow rules for GitHub-only pages (highest priority) ---
		...GITHUB_ONLY.map((path, i) => ({
			id: 200 + i,
			priority: 5,
			action: { type: "allow" },
			condition: {
				urlFilter: `||github.com/${path}`,
				resourceTypes: ["main_frame"],
			},
		})),

		// --- Specific path rewrites ---
		{
			id: 101,
			priority: 3,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/\\1/\\2/pull/\\3` },
			},
			condition: {
				regexFilter: "^https://github\\.com/([^/]+)/([^/]+)/pull/(\\d+)",
				resourceTypes: ["main_frame"],
			},
		},
		{
			id: 102,
			priority: 3,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/\\1/\\2/commit/\\3` },
			},
			condition: {
				regexFilter:
					"^https://github\\.com/([^/]+)/([^/]+)/commit/([a-f0-9]+)",
				resourceTypes: ["main_frame"],
			},
		},
		{
			id: 103,
			priority: 3,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/\\1/\\2/actions/\\3` },
			},
			condition: {
				regexFilter:
					"^https://github\\.com/([^/]+)/([^/]+)/actions/runs/(\\d+)",
				resourceTypes: ["main_frame"],
			},
		},

		// --- Global pages ---
		{
			id: 108,
			priority: 4,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/dashboard` },
			},
			condition: {
				regexFilter: "^https://github\\.com/?$",
				resourceTypes: ["main_frame"],
			},
		},
		{
			id: 105,
			priority: 4,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/notifications` },
			},
			condition: {
				regexFilter: "^https://github\\.com/notifications",
				resourceTypes: ["main_frame"],
			},
		},
		{
			id: 106,
			priority: 4,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/trending` },
			},
			condition: {
				regexFilter: "^https://github\\.com/trending",
				resourceTypes: ["main_frame"],
			},
		},
		{
			id: 109,
			priority: 4,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/issues` },
			},
			condition: {
				regexFilter: "^https://github\\.com/issues$",
				resourceTypes: ["main_frame"],
			},
		},
		{
			id: 110,
			priority: 4,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/prs` },
			},
			condition: {
				regexFilter: "^https://github\\.com/pulls$",
				resourceTypes: ["main_frame"],
			},
		},

		// --- Catch-all repo routes ---
		{
			id: 104,
			priority: 1,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/\\1/\\2` },
			},
			condition: {
				regexFilter: "^https://github\\.com/([^/]+)/([^/]+)/?$",
				resourceTypes: ["main_frame"],
			},
		},
		{
			id: 111,
			priority: 1,
			action: {
				type: "redirect",
				redirect: { regexSubstitution: `${host}/\\1/\\2/\\3` },
			},
			condition: {
				regexFilter: "^https://github\\.com/([^/]+)/([^/]+)/(.+)",
				resourceTypes: ["main_frame"],
			},
		},
	];

	return rules;
}
