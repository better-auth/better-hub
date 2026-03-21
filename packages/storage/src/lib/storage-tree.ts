import { ApiError } from "@pierre/storage";

export type StorageListItem = {
	name: string;
	path: string;
	type: "file" | "dir";
	size?: number;
};

/**
 * Flat file list from Pierre → immediate children of `dirPrefix` ("" = repo root).
 */
export function immediateChildrenFromPaths(
	files: Array<{ path: string; size: number }>,
	dirPrefix: string,
): StorageListItem[] {
	const norm = dirPrefix.replace(/^\/+|\/+$/g, "");
	const p = norm ? `${norm}/` : "";
	const map = new Map<string, StorageListItem>();

	for (const f of files) {
		if (!f.path.startsWith(p)) continue;
		const rest = f.path.slice(p.length);
		if (!rest) continue;
		const slash = rest.indexOf("/");
		const name = slash === -1 ? rest : rest.slice(0, slash);
		const isDir = slash !== -1;
		if (isDir) {
			map.set(name, {
				name,
				path: norm ? `${norm}/${name}` : name,
				type: "dir",
			});
		} else {
			map.set(name, {
				name,
				path: f.path,
				type: "file",
				size: f.size,
			});
		}
	}

	return [...map.values()].sort((a, b) => {
		if (a.type === "dir" && b.type !== "dir") return -1;
		if (a.type !== "dir" && b.type === "dir") return 1;
		return a.name.localeCompare(b.name);
	});
}

export function branchListIncludesRef(
	branches: Array<{ name: string; headSha: string }>,
	ref: string,
): boolean {
	return branches.some((b) => b.name === ref || b.headSha === ref);
}

export type ListStorageDirectoryResult =
	| { ok: false; reason: "no_branches"; defaultBranch: string }
	| { ok: false; reason: "ref_not_found"; ref: string; defaultBranch: string }
	| {
			ok: true;
			items: StorageListItem[];
			resolvedRef: string;
			defaultBranch: string;
	  };

type RemoteForList = {
	defaultBranch: string;
	listBranches: () => Promise<{ branches: Array<{ name: string; headSha: string }> }>;
	listFilesWithMetadata: (args: {
		ref: string;
	}) => Promise<{ files: Array<{ path: string; size: number }>; ref: string }>;
};

export async function listStorageDirectoryFromRemote(
	remote: RemoteForList,
	options: { ref?: string; pathPrefix: string },
): Promise<ListStorageDirectoryResult> {
	const { branches } = await remote.listBranches();
	if (branches.length === 0) {
		return {
			ok: false,
			reason: "no_branches",
			defaultBranch: remote.defaultBranch,
		};
	}

	const ref = options.ref ?? remote.defaultBranch;
	if (!branchListIncludesRef(branches, ref)) {
		return {
			ok: false,
			reason: "ref_not_found",
			ref,
			defaultBranch: remote.defaultBranch,
		};
	}

	try {
		const meta = await remote.listFilesWithMetadata({ ref });
		return {
			ok: true,
			items: immediateChildrenFromPaths(meta.files, options.pathPrefix),
			resolvedRef: meta.ref,
			defaultBranch: remote.defaultBranch,
		};
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) {
			return {
				ok: false,
				reason: "ref_not_found",
				ref,
				defaultBranch: remote.defaultBranch,
			};
		}
		throw e;
	}
}

export type StorageBlobResult =
	| { kind: "no_branches"; defaultBranch: string }
	| { kind: "ref_not_found"; ref: string }
	| { kind: "file_not_found" }
	| { kind: "file"; content: string; size: number };

type RemoteForFile = {
	defaultBranch: string;
	listBranches: () => Promise<{ branches: Array<{ name: string; headSha: string }> }>;
	getFileStream: (args: { path: string; ref: string }) => Promise<Response>;
};

export async function getStorageFileTextFromRemote(
	remote: RemoteForFile,
	path: string,
	ref: string,
): Promise<StorageBlobResult> {
	const { branches } = await remote.listBranches();
	if (branches.length === 0) {
		return { kind: "no_branches", defaultBranch: remote.defaultBranch };
	}

	if (!branchListIncludesRef(branches, ref)) {
		return { kind: "ref_not_found", ref };
	}

	const res = await remote.getFileStream({ path, ref });
	if (!res.ok) {
		if (res.status === 404) return { kind: "file_not_found" };
		throw new Error(`Pierre getFileStream failed: ${res.status}`);
	}

	const content = await res.text();
	const cl = res.headers.get("content-length");
	const size =
		cl !== null && cl !== ""
			? Number.parseInt(cl, 10)
			: Buffer.byteLength(content, "utf8");

	return {
		kind: "file",
		content,
		size: Number.isFinite(size) ? size : content.length,
	};
}
