import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/github";

type AnnotationType = "error" | "warning" | "debug" | "notice" | null;

interface LogLine {
	timestamp: string | null;
	content: string;
	annotation: AnnotationType;
}

interface StepLog {
	stepNumber: number;
	stepName: string;
	lines: LogLine[];
}

function parseLogText(raw: string): StepLog[] {
	const steps: StepLog[] = [];
	let current: StepLog | null = null;
	let stepCounter = 0;

	for (const line of raw.split("\n")) {
		const groupMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+##\[group\](.*)/);
		if (groupMatch) {
			stepCounter++;
			current = {
				stepNumber: stepCounter,
				stepName: groupMatch[2].trim(),
				lines: [],
			};
			steps.push(current);
			continue;
		}

		if (line.includes("##[endgroup]")) {
			continue;
		}

		if (!current) {
			if (line.trim()) {
				stepCounter++;
				current = {
					stepNumber: stepCounter,
					stepName: "Setup",
					lines: [],
				};
				steps.push(current);
			} else {
				continue;
			}
		}

		const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)/);
		const timestamp = tsMatch ? tsMatch[1] : null;
		let content = tsMatch ? tsMatch[2] : line;

		let annotation: AnnotationType = null;
		const annoMatch = content.match(/^##\[(error|warning|debug|notice)\](.*)/);
		if (annoMatch) {
			annotation = annoMatch[1] as AnnotationType;
			content = annoMatch[2];
		}

		current.lines.push({ timestamp, content, annotation });
	}

	return steps;
}

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const owner = searchParams.get("owner");
	const repo = searchParams.get("repo");
	const jobId = searchParams.get("job_id");

	if (!owner || !repo || !jobId) {
		return NextResponse.json(
			{ error: "Missing owner, repo, or job_id" },
			{ status: 400 },
		);
	}

	const token = await getGitHubToken();
	if (!token) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	try {
		const res = await fetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/jobs/${encodeURIComponent(jobId)}/logs`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/vnd.github+json",
				},
				redirect: "follow",
			},
		);

		if (res.status === 410) {
			return NextResponse.json(
				{ error: "Logs are no longer available" },
				{ status: 410 },
			);
		}
		if (res.status === 404) {
			return NextResponse.json({ error: "Job not found" }, { status: 404 });
		}
		if (!res.ok) {
			return NextResponse.json(
				{ error: "Failed to fetch logs" },
				{ status: res.status },
			);
		}

		const raw = await res.text();
		const steps = parseLogText(raw);

		return NextResponse.json({ steps });
	} catch {
		return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
	}
}
