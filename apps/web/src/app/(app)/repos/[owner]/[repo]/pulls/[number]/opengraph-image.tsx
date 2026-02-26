import { ImageResponse } from "next/og";
import { OG, OGFrame, StateIndicator, Avatar, ogFonts, truncate } from "@/lib/og/og-utils";
import { getOGPullRequest } from "@/lib/og/og-data";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const revalidate = 300;

export default async function Image({
	params,
}: {
	params: Promise<{ owner: string; repo: string; number: string }>;
}) {
	const { owner, repo, number: numStr } = await params;
	const pullNumber = parseInt(numStr, 10);
	const data = await getOGPullRequest(owner, repo, pullNumber);
	const fonts = await ogFonts();

	const title = data?.title || `PR #${pullNumber}`;
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
				<span>#{pullNumber}</span>
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
		{ ...size, fonts },
	);
}
