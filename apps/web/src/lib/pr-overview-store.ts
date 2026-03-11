import { prisma } from "./db";

interface FileAnalysis {
	filename: string;
	snippet: string;
	explanation: string;
	startLine?: number;
	endLine?: number;
}

interface ChangeGroup {
	id: string;
	title: string;
	summary: string;
	reviewOrder: number;
	files: FileAnalysis[];
}

export interface PrOverviewAnalysis {
	id: string;
	owner: string;
	repo: string;
	pullNumber: number;
	headSha: string;
	groups: ChangeGroup[];
	createdAt: string;
	updatedAt: string;
}

export async function getPrOverviewAnalysis(
	owner: string,
	repo: string,
	pullNumber: number,
	headSha?: string,
): Promise<PrOverviewAnalysis | null> {
	const record = await prisma.prOverviewAnalysis.findUnique({
		where: {
			owner_repo_pullNumber: { owner, repo, pullNumber },
		},
	});

	if (!record) return null;

	// If headSha is provided, check if analysis is stale
	if (headSha && record.headSha !== headSha) {
		return null;
	}

	try {
		const groups = JSON.parse(record.analysisJson) as ChangeGroup[];
		return {
			id: record.id,
			owner: record.owner,
			repo: record.repo,
			pullNumber: record.pullNumber,
			headSha: record.headSha,
			groups,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		};
	} catch {
		return null;
	}
}

export async function savePrOverviewAnalysis(
	owner: string,
	repo: string,
	pullNumber: number,
	headSha: string,
	groups: ChangeGroup[],
): Promise<PrOverviewAnalysis> {
	const now = new Date().toISOString();
	const analysisJson = JSON.stringify(groups);

	const record = await prisma.prOverviewAnalysis.upsert({
		where: {
			owner_repo_pullNumber: { owner, repo, pullNumber },
		},
		create: {
			id: crypto.randomUUID(),
			owner,
			repo,
			pullNumber,
			headSha,
			analysisJson,
			createdAt: now,
			updatedAt: now,
		},
		update: {
			headSha,
			analysisJson,
			updatedAt: now,
		},
	});

	return {
		id: record.id,
		owner: record.owner,
		repo: record.repo,
		pullNumber: record.pullNumber,
		headSha: record.headSha,
		groups,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

export async function deletePrOverviewAnalysis(
	owner: string,
	repo: string,
	pullNumber: number,
): Promise<void> {
	await prisma.prOverviewAnalysis.deleteMany({
		where: { owner, repo, pullNumber },
	});
}
