"use client";

import { useLayoutEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Keeps React Query cache in sync with server-provided initial data.
 *
 * `useInfiniteQuery({ initialData })` only seeds the cache when it's empty.
 * If the user navigates away and back (within React Query's gcTime), the
 * stale cache wins and the fresh server data is ignored.
 *
 * This hook replaces the React Query cache entry with the latest server
 * data whenever the fingerprint changes (including on mount), running
 * before paint via useLayoutEffect so there's no stale flash.
 *
 * @param queryKey  - The React Query key to sync
 * @param serverData - The fresh data from the server component
 * @param fingerprint - A lightweight string derived from the server data
 *   that changes whenever the data is meaningfully different
 */
export function useServerInitialData<T>(queryKey: QueryKey, serverData: T, fingerprint: string) {
	const queryClient = useQueryClient();

	useLayoutEffect(() => {
		queryClient.setQueryData(queryKey, serverData);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [fingerprint]);
}
