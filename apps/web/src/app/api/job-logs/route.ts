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

const ANSI_COLOR_SEQUENCE = new RegExp(String.raw`\u001b\[[0-9;]*m`, "g");

interface JobStepMeta {
	number: number;
	name: string;
	started_at?: string | null;
	completed_at?: string | null;
}

function parseLogLine(line: string): LogLine {
	// Preserve indentation in the rendered log content.
	// GitHub log lines have a timestamp, one separator space, then the raw content.
	const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s(.*)$/);
	const timestamp = tsMatch ? tsMatch[1] : null;
	let content = tsMatch ? tsMatch[2] : line;

	// Strip ANSI colors for clean, comparable output.
	content = content.replace(ANSI_COLOR_SEQUENCE, "");

	let annotation: AnnotationType = null;
	const annoMatch = content.match(/^##\[(error|warning|debug|notice)\](.*)/);
	if (annoMatch) {
		annotation = annoMatch[1] as AnnotationType;
		content = annoMatch[2];
	}

	return { timestamp, content, annotation };
}

function parseRawLines(raw: string): LogLine[] {
	return raw
		.split("\n")
		.filter((line) => line.length > 0)
		.map(parseLogLine);
}

function mapLinesToSteps(lines: LogLine[], stepsMeta: JobStepMeta[]): StepLog[] {
	if (stepsMeta.length === 0) {
		return [
			{
				stepNumber: 1,
				stepName: "Logs",
				lines,
			},
		];
	}

	const stepLogs = stepsMeta.map((step) => ({
		stepNumber: step.number,
		stepName: step.name,
		lines: [] as LogLine[],
	}));
	const byNumber = new Map(stepLogs.map((step) => [step.stepNumber, step]));
	const sortedMeta = [...stepsMeta].sort((a, b) => a.number - b.number);
	const preludeLines: LogLine[] = [];
	let lastMatchedStepNumber: number | null = null;
	let activeRunStepNumber: number | null = null;

	function normalizeStepName(name: string): string {
		return name
			.toLowerCase()
			.trim()
			.replace(/^run\s+/, "")
			.replace(/\s+/g, " ");
	}

	const stepWindows = sortedMeta.map((step) => {
		const startMs = step.started_at ? Date.parse(step.started_at) : NaN;
		const endMs = step.completed_at
			? Date.parse(step.completed_at)
			: step.started_at
				? Date.parse(step.started_at)
				: NaN;
		return {
			number: step.number,
			startMs,
			endMs,
		};
	});

	for (const line of lines) {
		let matchedStepNumber: number | null = null;
		const isEndGroup = line.content.includes("##[endgroup]");
		const runGroupMatch = line.content.match(/^##\[group\]Run\s+(.+)$/i);
		if (runGroupMatch) {
			const groupName = normalizeStepName(runGroupMatch[1] ?? "");
			const matchedStep = sortedMeta.find((step) => {
				const stepName = normalizeStepName(step.name);
				return (
					stepName === groupName ||
					stepName.includes(groupName) ||
					groupName.includes(stepName)
				);
			});
			activeRunStepNumber = matchedStep?.number ?? null;
		}

		if (activeRunStepNumber !== null) {
			matchedStepNumber = activeRunStepNumber;
		}
		if (isEndGroup) {
			activeRunStepNumber = null;
		}

		const ts = line.timestamp ? Date.parse(line.timestamp) : NaN;

		if (matchedStepNumber === null && !Number.isNaN(ts)) {
			for (const step of stepWindows) {
				if (Number.isNaN(step.startMs) || Number.isNaN(step.endMs))
					continue;
				if (ts >= step.startMs && ts <= step.endMs) {
					matchedStepNumber = step.number;
				}
			}

			if (matchedStepNumber === null) {
				for (const step of stepWindows) {
					if (Number.isNaN(step.startMs)) continue;
					if (ts >= step.startMs) {
						matchedStepNumber = step.number;
					}
				}
			}
		}

		if (matchedStepNumber === null) {
			if (lastMatchedStepNumber !== null) {
				matchedStepNumber = lastMatchedStepNumber;
			} else {
				preludeLines.push(line);
				continue;
			}
		}

		const target = byNumber.get(matchedStepNumber);
		if (!target) continue;
		target.lines.push(line);
		lastMatchedStepNumber = matchedStepNumber;
	}

	if (preludeLines.length > 0 && stepLogs.length > 0) {
		stepLogs[0].lines = [...preludeLines, ...stepLogs[0].lines];
	}

	return stepLogs;
}

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const owner = searchParams.get("owner");
	const repo = searchParams.get("repo");
	const jobId = searchParams.get("job_id");
	const includeRaw = searchParams.get("include_raw") === "1";
	const responseFormat = searchParams.get("format");

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
		const encodedOwner = encodeURIComponent(owner);
		const encodedRepo = encodeURIComponent(repo);
		const encodedJobId = encodeURIComponent(jobId);
		const commonHeaders = {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
		};
		const [logsRes, jobRes] = await Promise.all([
			fetch(
				`https://api.github.com/repos/${encodedOwner}/${encodedRepo}/actions/jobs/${encodedJobId}/logs`,
				{
					headers: commonHeaders,
					redirect: "follow",
				},
			),
			fetch(
				`https://api.github.com/repos/${encodedOwner}/${encodedRepo}/actions/jobs/${encodedJobId}`,
				{
					headers: commonHeaders,
				},
			),
		]);

		if (logsRes.status === 410) {
			return NextResponse.json(
				{ error: "Logs are no longer available" },
				{ status: 410 },
			);
		}
		if (logsRes.status === 404) {
			return NextResponse.json({ error: "Job not found" }, { status: 404 });
		}
		if (!logsRes.ok) {
			return NextResponse.json(
				{ error: "Failed to fetch logs" },
				{ status: logsRes.status },
			);
		}

		const raw = await logsRes.text();
		const lines = parseRawLines(raw);
		const jobData = jobRes.ok ? await jobRes.json().catch(() => null) : null;
		const stepsMeta = Array.isArray(jobData?.steps)
			? (jobData.steps as JobStepMeta[])
			: [];
		const steps = mapLinesToSteps(lines, stepsMeta);

		if (responseFormat === "raw") {
			return new Response(raw, {
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}

		return NextResponse.json(includeRaw ? { steps, raw } : { steps });
	} catch {
		return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
	}
}
