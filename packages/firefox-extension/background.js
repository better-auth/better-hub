const DEFAULT_HOST = "https://better-hub.com";

browser.runtime.onInstalled.addListener(() => {
	browser.storage.local.get(["enabled", "host"]).then((data) => {
		const enabled = data.enabled !== false;
		const host = data.host || DEFAULT_HOST;
		browser.storage.local.set({ enabled, host });

		if (enabled) {
			if (host === DEFAULT_HOST) {
				browser.declarativeNetRequest.updateEnabledRulesets({
					enableRulesetIds: ["redirect_rules"],
				});
			} else {
				switchToDynamicRules(host);
			}
		}
		updateIcon(enabled);
	});
});

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (msg.type === "toggle") {
		browser.storage.local.get(["host"]).then((data) => {
			const host = data.host || DEFAULT_HOST;
			browser.storage.local.set({ enabled: msg.enabled });

			if (msg.enabled) {
				if (host === DEFAULT_HOST) {
					browser.declarativeNetRequest.updateEnabledRulesets({
						enableRulesetIds: ["redirect_rules"],
					});
				} else {
					switchToDynamicRules(host);
				}
			} else {
				browser.declarativeNetRequest.updateEnabledRulesets({
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
		browser.storage.local.set({ host });
		browser.storage.local.get(["enabled"]).then((data) => {
			if (data.enabled !== false) {
				if (host === DEFAULT_HOST) {
					clearDynamicRules();
					browser.declarativeNetRequest.updateEnabledRulesets({
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

async function switchToDynamicRules(host) {
	await browser.declarativeNetRequest.updateEnabledRulesets({
		disableRulesetIds: ["redirect_rules"],
	});

	const existing = await browser.declarativeNetRequest.getDynamicRules();
	await browser.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: existing.map((r) => r.id),
		addRules: buildRules(host),
	});
}

async function clearDynamicRules() {
	const existing = await browser.declarativeNetRequest.getDynamicRules();
	await browser.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: existing.map((r) => r.id),
	});
}

function updateIcon(enabled) {
	const path = enabled ? "icons/icon" : "icons/icon-disabled";
	browser.action
		.setIcon({
			path: { 16: `${path}-16.png`, 48: `${path}-48.png` },
		})
		.catch(() => {});
}

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
		...GITHUB_ONLY.map((path, i) => ({
			id: 200 + i,
			priority: 5,
			action: { type: "allow" },
			condition: {
				urlFilter: `||github.com/${path}`,
				resourceTypes: ["main_frame"],
			},
		})),

		{
			id: 250,
			priority: 5,
			action: { type: "allow" },
			condition: {
				regexFilter: "^https://github\\.com/[^/]+/[^/]+/settings",
				resourceTypes: ["main_frame"],
			},
		},

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
				regexFilter: "^https://github\\.com/([^/]+)/[^/]+/(.+)",
				resourceTypes: ["main_frame"],
			},
		},
	];

	return rules;
}
