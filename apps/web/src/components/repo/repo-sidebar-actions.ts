"use server";

import { cookies } from "next/headers";
import { REPO_SIDEBAR_COOKIE } from "./repo-sidebar-constants";

const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function setRepoSidebarState(collapsed: boolean, width: number) {
	const cookieStore = await cookies();
	cookieStore.set(REPO_SIDEBAR_COOKIE, JSON.stringify({ collapsed, width }), {
		maxAge: MAX_AGE,
		path: "/",
		sameSite: "lax",
	});
}
