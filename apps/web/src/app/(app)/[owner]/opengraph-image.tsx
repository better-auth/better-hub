import { ImageResponse } from "next/og";
import { OG, OGFrame, Avatar, StatBadge, ogFonts, truncate } from "@/lib/og/og-utils";
import { getOGOrg, getOGUser } from "@/lib/og/og-data";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ owner: string }> }) {
	const { owner } = await params;
	const fonts = await ogFonts();

	// Try org first, fall back to user
	const orgData = await getOGOrg(owner);
	if (orgData) {
		return new ImageResponse(
			<OGFrame>
				<div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
					{orgData.avatar_url && (
						<Avatar src={orgData.avatar_url} size={96} />
					)}
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "4px",
						}}
					>
						{orgData.name && (
							<div
								style={{
									display: "flex",
									fontSize: "36px",
									color: OG.fg,
								}}
							>
								{truncate(orgData.name, 40)}
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
							@{orgData.login}
						</div>
					</div>
				</div>

				{orgData.description && (
					<div
						style={{
							display: "flex",
							marginTop: "28px",
							fontSize: "22px",
							color: OG.muted,
							lineHeight: 1.5,
						}}
					>
						{truncate(orgData.description, 120)}
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
					<StatBadge label="repos" value={orgData.public_repos} />
					<StatBadge
						label="followers"
						value={formatNum(orgData.followers)}
					/>
				</div>
			</OGFrame>,
			{ ...size, fonts },
		);
	}

	// Fall back to user
	const userData = await getOGUser(owner);

	return new ImageResponse(
		<OGFrame>
			<div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
				{userData?.avatar_url && (
					<Avatar src={userData.avatar_url} size={96} />
				)}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "4px",
					}}
				>
					{userData?.name && (
						<div
							style={{
								display: "flex",
								fontSize: "36px",
								color: OG.fg,
							}}
						>
							{truncate(userData.name, 40)}
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
						@{userData?.login || owner}
					</div>
				</div>
			</div>

			{userData?.bio && (
				<div
					style={{
						display: "flex",
						marginTop: "28px",
						fontSize: "22px",
						color: OG.muted,
						lineHeight: 1.5,
					}}
				>
					{truncate(userData.bio, 120)}
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
				{userData && (
					<StatBadge label="repos" value={userData.public_repos} />
				)}
				{userData && (
					<StatBadge
						label="followers"
						value={formatNum(userData.followers)}
					/>
				)}
			</div>
		</OGFrame>,
		{ ...size, fonts },
	);
}

function formatNum(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	return String(n);
}
