"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface DeletedCommentsContextValue {
	deletedCount: number;
	markDeleted: () => void;
}

const DeletedCommentsContext = createContext<DeletedCommentsContextValue | null>(null);

export function DeletedCommentsProvider({ children }: { children: ReactNode }) {
	const [deletedCount, setDeletedCount] = useState(0);

	const markDeleted = useCallback(() => {
		setDeletedCount((c) => c + 1);
	}, []);

	return (
		<DeletedCommentsContext.Provider value={{ deletedCount, markDeleted }}>
			{children}
		</DeletedCommentsContext.Provider>
	);
}

export function useDeletedComments() {
	return useContext(DeletedCommentsContext);
}
