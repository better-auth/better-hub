import { ImageResponse } from "next/og";
import { OG, OGFrame, Avatar, StatBadge, ogFonts, truncate } from "@/lib/og/og-utils";
import { getOGUser } from "@/lib/og/og-data";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
	const { username } = await params;
	const data = await getOGUser(username);
	const fonts = await ogFonts();

	return new ImageResponse(
		<OGFrame>
			<div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
				{data?.avatar_url && <Avatar src={data.avatar_url} size={96} />}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "4px",
					}}
				>
					{data?.name && (
						<div
							style={{
								display: "flex",
								fontSize: "36px",
								color: OG.fg,
							}}
						>
							{truncate(data.name, 40)}
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
						@{data?.login || username}
					</div>
				</div>
			</div>

			{data?.bio && (
				<div
					style={{
						display: "flex",
						marginTop: "28px",
						fontSize: "22px",
						color: OG.muted,
						lineHeight: 1.5,
					}}
				>
					{truncate(data.bio, 120)}
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
				{data && <StatBadge label="repos" value={data.public_repos} />}
				{data && (
					<StatBadge
						label="followers"
						value={formatNum(data.followers)}
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
