const STORAGE_KEY = "better-github-recent-views";
const MAX_ITEMS = 20;

export interface RecentViewItem {
	type: "repo" | "issue" | "pr";
	url: string;
	title: string;
	subtitle: string;
	number?: number;
	state?: string;
	image?: string;
	viewedAt: number;
}

export function getRecentViews(): RecentViewItem[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as RecentViewItem[];
	} catch {
		return [];
	}
}

export function addRecentView(item: Omit<RecentViewItem, "viewedAt">) {
	if (typeof window === "undefined") return;
	try {
		const views = getRecentViews();
		// Remove existing entry for same URL
		const filtered = views.filter((v) => v.url !== item.url);
		// Add to front
		filtered.unshift({ ...item, viewedAt: Date.now() });
		// Trim
		localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
	} catch {
		// localStorage might be full or unavailable
	}
}
