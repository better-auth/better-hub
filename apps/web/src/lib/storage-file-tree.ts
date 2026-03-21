import { buildFileTree, type FileTreeNode } from "@/lib/file-tree";

/**
 * Build explorer tree from Pierre flat file paths (all blobs; dirs inferred).
 */
export function buildStorageFileTree(files: Array<{ path: string; size: number }>): FileTreeNode[] {
	const seenDir = new Set<string>();
	const items: Array<{ path: string; type: string; size?: number }> = [];

	for (const f of files) {
		const parts = f.path.split("/").filter(Boolean);
		for (let i = 1; i < parts.length; i++) {
			const dirPath = parts.slice(0, i).join("/");
			if (!seenDir.has(dirPath)) {
				seenDir.add(dirPath);
				items.push({ path: dirPath, type: "tree" });
			}
		}
		items.push({ path: f.path, type: "blob", size: f.size });
	}

	return buildFileTree(items);
}
