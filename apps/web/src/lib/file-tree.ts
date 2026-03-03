export interface FileTreeNode {
	name: string;
	path: string;
	type: "file" | "dir";
	size?: number;
	children?: FileTreeNode[];
}

export function buildFileTree(
	flatItems: { path: string; type: string; size?: number }[],
): FileTreeNode[] {
	const root: FileTreeNode[] = [];
	const dirMap = new Map<string, FileTreeNode>();

	for (const item of flatItems) {
		if (item.type !== "blob" && item.type !== "tree") continue;

		const parts = item.path.split("/");
		const name = parts[parts.length - 1];
		const nodeType = item.type === "tree" ? "dir" : "file";

		const node: FileTreeNode = {
			name,
			path: item.path,
			type: nodeType,
			...(item.size !== undefined && nodeType === "file"
				? { size: item.size }
				: {}),
			...(nodeType === "dir" ? { children: [] } : {}),
		};

		if (nodeType === "dir") {
			dirMap.set(item.path, node);
		}

		if (parts.length === 1) {
			root.push(node);
		} else {
			const parentPath = parts.slice(0, -1).join("/");
			const parent = dirMap.get(parentPath);
			if (parent && parent.children) {
				parent.children.push(node);
			}
		}
	}

	const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
		nodes.sort((a, b) => {
			if (a.type === "dir" && b.type === "file") return -1;
			if (a.type === "file" && b.type === "dir") return 1;
			return a.name.localeCompare(b.name);
		});
		for (const node of nodes) {
			if (node.children) sortNodes(node.children);
		}
		return nodes;
	};

	return sortNodes(root);
}

export function getAncestorPaths(filePath: string): string[] {
	const parts = filePath.split("/");
	const ancestors: string[] = [];
	for (let i = 1; i < parts.length; i++) {
		ancestors.push(parts.slice(0, i).join("/"));
	}
	return ancestors;
}

export interface DiffFile {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch?: string;
	previous_filename?: string;
}

export interface DiffTreeNode {
	name: string;
	path: string;
	type: "file" | "dir";
	status?: string;
	additions?: number;
	deletions?: number;
	fileIndex?: number;
	children?: DiffTreeNode[];
}

export function buildDiffFileTree(files: DiffFile[]): DiffTreeNode[] {
	const root: DiffTreeNode[] = [];
	const dirMap = new Map<string, DiffTreeNode>();

	const ensureDirectory = (dirPath: string): DiffTreeNode => {
		if (dirMap.has(dirPath)) {
			return dirMap.get(dirPath)!;
		}

		const parts = dirPath.split("/");
		const name = parts[parts.length - 1];

		const node: DiffTreeNode = {
			name,
			path: dirPath,
			type: "dir",
			children: [],
		};

		dirMap.set(dirPath, node);

		if (parts.length === 1) {
			root.push(node);
		} else {
			const parentPath = parts.slice(0, -1).join("/");
			const parent = ensureDirectory(parentPath);
			parent.children!.push(node);
		}

		return node;
	};

	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const parts = file.filename.split("/");
		const name = parts[parts.length - 1];

		const node: DiffTreeNode = {
			name,
			path: file.filename,
			type: "file",
			status: file.status,
			additions: file.additions,
			deletions: file.deletions,
			fileIndex: i,
		};

		if (parts.length === 1) {
			root.push(node);
		} else {
			const parentPath = parts.slice(0, -1).join("/");
			const parent = ensureDirectory(parentPath);
			parent.children!.push(node);
		}
	}

	const aggregateStats = (node: DiffTreeNode): { additions: number; deletions: number } => {
		if (node.type === "file") {
			return { additions: node.additions ?? 0, deletions: node.deletions ?? 0 };
		}
		let additions = 0;
		let deletions = 0;
		for (const child of node.children ?? []) {
			const stats = aggregateStats(child);
			additions += stats.additions;
			deletions += stats.deletions;
		}
		node.additions = additions;
		node.deletions = deletions;
		return { additions, deletions };
	};

	const sortNodes = (nodes: DiffTreeNode[]): DiffTreeNode[] => {
		nodes.sort((a, b) => {
			if (a.type === "dir" && b.type === "file") return -1;
			if (a.type === "file" && b.type === "dir") return 1;
			return a.name.localeCompare(b.name);
		});
		for (const node of nodes) {
			if (node.children) sortNodes(node.children);
		}
		return nodes;
	};

	for (const node of root) {
		aggregateStats(node);
	}

	return sortNodes(root);
}
