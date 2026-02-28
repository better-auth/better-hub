import { NextRequest, NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";

export interface UserProfile {
	login: string;
	name: string | null;
	avatar_url: string;
	html_url: string;
	bio: string | null;
	company: string | null;
	location: string | null;
	blog: string | null;
	twitter_username: string | null;
	followers: number;
	following: number;
	public_repos: number;
	type: string;
	created_at: string;
}

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const username = searchParams.get("username");

	if (!username) {
		return NextResponse.json({ error: "Missing username parameter" }, { status: 400 });
	}

	const octokit = await getOctokit();
	if (!octokit) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	try {
		const { data } = await octokit.users.getByUsername({ username });

		const profile: UserProfile = {
			login: data.login,
			name: data.name,
			avatar_url: data.avatar_url,
			html_url: data.html_url,
			bio: data.bio,
			company: data.company,
			location: data.location,
			blog: data.blog || null,
			twitter_username: data.twitter_username || null,
			followers: data.followers,
			following: data.following,
			public_repos: data.public_repos,
			type: data.type,
			created_at: data.created_at,
		};

		return NextResponse.json(profile, {
			headers: {
				// Prevent shared cache from serving authenticated responses to other users
				"Cache-Control": "private, no-store",
			},
		});
	} catch (error) {
		if (error instanceof Error && "status" in error && error.status === 404) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}
		return NextResponse.json(
			{ error: "Failed to fetch user profile" },
			{ status: 500 },
		);
	}
}
