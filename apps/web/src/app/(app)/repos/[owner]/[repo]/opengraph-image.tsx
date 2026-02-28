import { ImageResponse } from "next/og";
import { OG, OGFrame, Avatar, StatBadge, ogFonts, truncate } from "@/lib/og/og-utils";
import { getOGRepo } from "@/lib/og/og-data";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const revalidate = 300;

export default async function Image({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;
	const data = await getOGRepo(owner, repo);
	const fonts = await ogFonts();

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
		{ ...size, fonts },
	);
}

function formatNum(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	return String(n);
}
