"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchIssueComments } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";
import {
	IssueConversation,
	type IssueTimelineEntry,
	type IssueCommentEntry,
	type IssueDescriptionEntry,
} from "@/components/issue/issue-conversation";
import { IssueTimelineEvents } from "@/components/issue/issue-timeline-events";
import type { IssueTimelineEvent } from "@/lib/github";

export interface IssueComment {
	id: number;
	body?: string | null;
	bodyHtml?: string;
	user: { login: string; avatar_url: string; type?: string } | null;
	created_at: string;
	author_association?: string;
	reactions?: Record<string, unknown>;
}

function toEntries(comments: IssueComment[]): IssueCommentEntry[] {
	return comments.map((c) => ({
		type: "comment" as const,
		id: c.id,
		user: c.user,
		body: c.body || "",
		bodyHtml: c.bodyHtml,
		created_at: c.created_at,
		author_association: c.author_association,
		reactions: c.reactions ?? undefined,
	}));
}

type TimelineSegment =
	| { type: "entries"; entries: IssueTimelineEntry[] }
	| { type: "events"; events: IssueTimelineEvent[] };

function interleaveTimelineAndComments(
	descriptionEntry: IssueDescriptionEntry,
	comments: IssueComment[],
	timelineEvents: IssueTimelineEvent[] = [],
): TimelineSegment[] {
	const commentEntries = toEntries(comments);

	const allItems: Array<
		| { kind: "entry"; item: IssueTimelineEntry; date: Date }
		| { kind: "event"; item: IssueTimelineEvent; date: Date }
	> = [
		{
			kind: "entry",
			item: descriptionEntry,
			date: new Date(descriptionEntry.created_at),
		},
		...commentEntries.map((entry) => ({
			kind: "entry" as const,
			item: entry,
			date: new Date(entry.created_at),
		})),
		...timelineEvents.map((event) => ({
			kind: "event" as const,
			item: event,
			date: new Date(event.created_at),
		})),
	];

	allItems.sort((a, b) => a.date.getTime() - b.date.getTime());

	const segments: TimelineSegment[] = [];
	let currentEntries: IssueTimelineEntry[] = [];
	let currentEvents: IssueTimelineEvent[] = [];

	for (const item of allItems) {
		if (item.kind === "entry") {
			if (currentEvents.length > 0) {
				segments.push({ type: "events", events: currentEvents });
				currentEvents = [];
			}
			currentEntries.push(item.item);
		} else {
			if (currentEntries.length > 0) {
				segments.push({ type: "entries", entries: currentEntries });
				currentEntries = [];
			}
			currentEvents.push(item.item);
		}
	}

	if (currentEntries.length > 0) {
		segments.push({ type: "entries", entries: currentEntries });
	}
	if (currentEvents.length > 0) {
		segments.push({ type: "events", events: currentEvents });
	}

	return segments;
}

export function IssueCommentsClient({
	owner,
	repo,
	issueNumber,
	initialComments,
	descriptionEntry,
	canEdit,
	issueTitle,
	currentUserLogin,
	viewerHasWriteAccess,
	timelineEvents,
}: {
	owner: string;
	repo: string;
	issueNumber: number;
	initialComments: IssueComment[];
	descriptionEntry: IssueDescriptionEntry;
	canEdit?: boolean;
	issueTitle?: string;
	currentUserLogin?: string;
	viewerHasWriteAccess?: boolean;
	timelineEvents?: IssueTimelineEvent[];
}) {
	const { data: comments = initialComments } = useQuery({
		queryKey: ["issue-comments", owner, repo, issueNumber],
		queryFn: () =>
			fetchIssueComments(owner, repo, issueNumber) as Promise<IssueComment[]>,
		initialData: initialComments,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});

	const segments = useMemo(
		() => interleaveTimelineAndComments(descriptionEntry, comments, timelineEvents),
		[descriptionEntry, comments, timelineEvents],
	);

	return (
		<>
			{segments.map((segment, idx) => {
				const isLastSegment = idx === segments.length - 1;
				return segment.type === "entries" ? (
					<IssueConversation
						key={`entries-${idx}`}
						entries={segment.entries}
						owner={owner}
						repo={repo}
						issueNumber={issueNumber}
						canEdit={canEdit}
						issueTitle={issueTitle}
						currentUserLogin={currentUserLogin}
						viewerHasWriteAccess={viewerHasWriteAccess}
						hasMoreAfter={!isLastSegment}
					/>
				) : (
					<IssueTimelineEvents
						key={`events-${idx}`}
						events={segment.events}
						owner={owner}
						repo={repo}
						isLastSegment={isLastSegment}
					/>
				);
			})}
		</>
	);
}
