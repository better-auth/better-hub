import { type NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import {
	OG,
	OGFrame,
	Avatar,
	StatBadge,
	StateIndicator,
	ogFonts,
	truncate,
} from "@/lib/og/og-utils";
import { getOGRepo, getOGIssue, getOGPullRequest, getOGUser, getOGOrg } from "@/lib/og/og-data";

export const runtime = "nodejs";

const SIZE = { width: OG.width, height: OG.height };

function formatNum(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	return String(n);
}

// ── Repo OG ──

async function repoImage(owner: string, repo: string, fonts: Awaited<ReturnType<typeof ogFonts>>) {
	const data = await getOGRepo(owner, repo);

	return new ImageResponse(
		<OGFrame>
			<div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
				{data?.owner_avatar && <Avatar src={data.owner_avatar} size={72} />}
				<div
					style={{
						display: "flex",
						fontFamily: "Geist Mono",
						fontSize: "32px",
						color: OG.fg,
					}}
				>
					{owner}/{repo}
				</div>
			</div>

			{data?.description && (
				<div
					style={{
						display: "flex",
						marginTop: "28px",
						fontSize: "24px",
						color: OG.muted,
						lineHeight: 1.5,
					}}
				>
					{truncate(data.description, 140)}
				</div>
			)}

			<div
				style={{
					display: "flex",
					marginTop: "auto",
					gap: "32px",
					alignItems: "center",
				}}
			>
				{data?.language && (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							fontSize: "20px",
							color: OG.muted,
						}}
					>
						<div
							style={{
								display: "flex",
								width: "14px",
								height: "14px",
								borderRadius: "50%",
								backgroundColor: OG.link,
							}}
						/>
						{data.language}
					</div>
				)}
				{data && (
					<StatBadge
						label="stars"
						value={formatNum(data.stargazers_count)}
					/>
				)}
				{data && (
					<StatBadge
						label="forks"
						value={formatNum(data.forks_count)}
					/>
				)}
			</div>
		</OGFrame>,
		{ ...SIZE, fonts },
	);
}

// ── Issue OG ──

async function issueImage(
	owner: string,
	repo: string,
	number: number,
	fonts: Awaited<ReturnType<typeof ogFonts>>,
) {
	const data = await getOGIssue(owner, repo, number);
	const title = data?.title || `Issue #${number}`;
	const state = data?.state || "open";

	return new ImageResponse(
		<OGFrame>
			<div
				style={{
					display: "flex",
					fontFamily: "Geist Mono",
					fontSize: "18px",
					color: OG.muted,
				}}
			>
				{owner}/{repo}
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "16px",
					marginTop: "32px",
				}}
			>
				<StateIndicator state={state} size={20} />
				<div
					style={{
						display: "flex",
						fontSize: "36px",
						color: OG.fg,
						lineHeight: 1.3,
					}}
				>
					{truncate(title, 80)}
				</div>
			</div>

			<div
				style={{
					display: "flex",
					fontFamily: "Geist Mono",
					fontSize: "22px",
					color: OG.muted,
					marginTop: "12px",
				}}
			>
				#{number}
			</div>

			<div
				style={{
					display: "flex",
					marginTop: "auto",
					alignItems: "center",
					gap: "12px",
				}}
			>
				{data?.author_avatar && (
					<Avatar src={data.author_avatar} size={40} />
				)}
				{data?.author && (
					<div
						style={{
							display: "flex",
							fontSize: "20px",
							color: OG.muted,
						}}
					>
						{data.author}
					</div>
				)}
			</div>
		</OGFrame>,
		{ ...SIZE, fonts },
	);
}

// ── Pull Request OG ──

async function prImage(
	owner: string,
	repo: string,
	number: number,
	fonts: Awaited<ReturnType<typeof ogFonts>>,
) {
	const data = await getOGPullRequest(owner, repo, number);
	const title = data?.title || `PR #${number}`;
	const displayState = data?.merged ? "merged" : data?.state || "open";

	return new ImageResponse(
		<OGFrame>
			<div
				style={{
					display: "flex",
					fontFamily: "Geist Mono",
					fontSize: "18px",
					color: OG.muted,
				}}
			>
				{owner}/{repo}
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "16px",
					marginTop: "32px",
				}}
			>
				<StateIndicator state={displayState} size={20} />
				<div
					style={{
						display: "flex",
						fontSize: "36px",
						color: OG.fg,
						lineHeight: 1.3,
					}}
				>
					{truncate(title, 80)}
				</div>
			</div>

			<div
				style={{
					display: "flex",
					fontFamily: "Geist Mono",
					fontSize: "22px",
					color: OG.muted,
					marginTop: "12px",
					gap: "24px",
					alignItems: "center",
				}}
			>
				<span>#{number}</span>
				{data && (data.additions > 0 || data.deletions > 0) && (
					<div
						style={{
							display: "flex",
							gap: "16px",
							fontSize: "20px",
						}}
					>
						<span style={{ color: OG.green }}>
							+{data.additions}
						</span>
						<span style={{ color: OG.red }}>
							-{data.deletions}
						</span>
					</div>
				)}
			</div>

			<div
				style={{
					display: "flex",
					marginTop: "auto",
					alignItems: "center",
					gap: "12px",
				}}
			>
				{data?.author_avatar && (
					<Avatar src={data.author_avatar} size={40} />
				)}
				{data?.author && (
					<div
						style={{
							display: "flex",
							fontSize: "20px",
							color: OG.muted,
						}}
					>
						{data.author}
					</div>
				)}
			</div>
		</OGFrame>,
		{ ...SIZE, fonts },
	);
}

// ── User / Owner OG ──

async function userImage(username: string, fonts: Awaited<ReturnType<typeof ogFonts>>) {
	// Try org first, fall back to user
	const orgData = await getOGOrg(username);
	const userData = orgData ? null : await getOGUser(username);
	const d = orgData || userData;

	const name = orgData?.name ?? userData?.name ?? null;
	const login = d?.login || username;
	const avatar = d?.avatar_url || "";
	const description = orgData?.description ?? userData?.bio ?? null;
	const repos = d?.public_repos ?? 0;
	const followers = d?.followers ?? 0;

	return new ImageResponse(
		<OGFrame>
			<div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
				{avatar && <Avatar src={avatar} size={96} />}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "4px",
					}}
				>
					{name && (
						<div
							style={{
								display: "flex",
								fontSize: "36px",
								color: OG.fg,
							}}
						>
							{truncate(name, 40)}
						</div>
					)}
					<div
						style={{
							display: "flex",
							fontFamily: "Geist Mono",
							fontSize: "22px",
							color: OG.muted,
						}}
					>
						@{login}
					</div>
				</div>
			</div>

			{description && (
				<div
					style={{
						display: "flex",
						marginTop: "28px",
						fontSize: "22px",
						color: OG.muted,
						lineHeight: 1.5,
					}}
				>
					{truncate(description, 120)}
				</div>
			)}

			<div
				style={{
					display: "flex",
					marginTop: "auto",
					gap: "32px",
					alignItems: "center",
				}}
			>
				<StatBadge label="repos" value={repos} />
				<StatBadge label="followers" value={formatNum(followers)} />
			</div>
		</OGFrame>,
		{ ...SIZE, fonts },
	);
}

// ── Route handler ──

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const type = searchParams.get("type");
	const owner = searchParams.get("owner");
	const repo = searchParams.get("repo");
	const number = searchParams.get("number");
	const username = searchParams.get("username");

	const fonts = await ogFonts();

	if (type === "repo" && owner && repo) {
		return repoImage(owner, repo, fonts);
	}

	if (type === "issue" && owner && repo && number) {
		return issueImage(owner, repo, parseInt(number, 10), fonts);
	}

	if (type === "pr" && owner && repo && number) {
		return prImage(owner, repo, parseInt(number, 10), fonts);
	}

	if (type === "user" && username) {
		return userImage(username, fonts);
	}

	if (type === "owner" && owner) {
		return userImage(owner, fonts);
	}

	// Fallback: generic branded image
	return new ImageResponse(
		<OGFrame>
			<div
				style={{
					display: "flex",
					flex: 1,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Geist Mono",
						fontSize: "48px",
						color: OG.fg,
						letterSpacing: "0.02em",
					}}
				>
					BETTER-HUB.
				</div>
			</div>
		</OGFrame>,
		{ ...SIZE, fonts },
	);
}
