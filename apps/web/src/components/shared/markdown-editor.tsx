"use client";

import { useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { CustomMention } from "@/lib/tiptap-mention";
import { createSuggestionConfig, type MentionUser } from "@/components/shared/mention-suggestion";
import {
	Bold,
	Italic,
	Code,
	Link,
	Quote,
	List,
	ListOrdered,
	FileCode,
	Heading2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface MarkdownEditorRef {
	focus: () => void;
	getTextarea: () => HTMLTextAreaElement | null;
}

interface MarkdownEditorProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
	autoFocus?: boolean;
	/** Compact mode uses smaller sizing for inline comment forms */
	compact?: boolean;
	onKeyDown?: (e: React.KeyboardEvent) => void;
	className?: string;
	/** Conversation participants for @mention autocomplete */
	participants?: MentionUser[];
	/** Repo owner (org or user) to prioritize in @mention search */
	owner?: string;
}

export const MarkdownEditor = forwardRef<MarkdownEditorRef, MarkdownEditorProps>(
	function MarkdownEditor(
		{
			value,
			onChange,
			placeholder = "Leave a comment...",
			rows = 4,
			autoFocus = false,
			compact = false,
			onKeyDown,
			className,
			participants = [],
			owner = "",
		},
		ref,
	) {
		const lastReportedMd = useRef(value);
		const onKeyDownRef = useRef(onKeyDown);
		onKeyDownRef.current = onKeyDown;

		// Keep a ref so the suggestion callback always reads the latest participants
		const participantsRef = useRef<MentionUser[]>(participants);
		participantsRef.current = participants;

		const ownerRef = useRef(owner);
		ownerRef.current = owner;

		const suggestionConfig = useMemo(
			() => createSuggestionConfig(participantsRef, ownerRef),
			[],
		);

		const editor = useEditor({
			extensions: [
				StarterKit.configure({
					heading: { levels: [2, 3] },
				}),
				LinkExtension.configure({
					openOnClick: false,
					HTMLAttributes: { class: "" },
				}),
				Placeholder.configure({ placeholder }),
				Markdown,
				CustomMention.configure({
					HTMLAttributes: { class: "mention" },
					suggestion: suggestionConfig,
					renderLabel: ({ node }) =>
						`@${node.attrs.label ?? node.attrs.id}`,
				}),
			],
			content: value,
			onUpdate: ({ editor }) => {
				const md = (
					editor.storage as unknown as Record<
						string,
						{ getMarkdown: () => string }
					>
				).markdown.getMarkdown();
				lastReportedMd.current = md;
				onChange(md);
			},
			immediatelyRender: false,
			autofocus: autoFocus,
			editorProps: {
				handleKeyDown: (_view, event) => {
					if (onKeyDownRef.current) {
						onKeyDownRef.current(
							event as unknown as React.KeyboardEvent,
						);
					}
					return false;
				},
				attributes: {
					class: cn(
						"ghmd ghmd-sm outline-none",
						compact
							? "text-[13px] px-2.5 pt-2 pb-1"
							: "text-sm p-2.5",
					),
				},
			},
		});

		// Sync external value changes (e.g. form reset after submit)
		useEffect(() => {
			if (!editor) return;
			if (value !== lastReportedMd.current) {
				lastReportedMd.current = value;
				editor.commands.setContent(value);
			}
		}, [value, editor]);

		useImperativeHandle(ref, () => ({
			focus: () => editor?.commands.focus(),
			getTextarea: () => null,
		}));

		const toolbarActions = compact
			? [
					{
						icon: Bold,
						action: () =>
							editor?.chain().focus().toggleBold().run(),
						title: "Bold",
						active: "bold",
					},
					{
						icon: Italic,
						action: () =>
							editor
								?.chain()
								.focus()
								.toggleItalic()
								.run(),
						title: "Italic",
						active: "italic",
					},
					{
						icon: Code,
						action: () =>
							editor?.chain().focus().toggleCode().run(),
						title: "Inline code",
						active: "code",
					},
					{
						icon: FileCode,
						action: () =>
							editor
								?.chain()
								.focus()
								.toggleCodeBlock()
								.run(),
						title: "Code block",
						active: "codeBlock",
					},
					{
						icon: Link,
						action: () => {
							if (!editor) return;
							if (editor.isActive("link")) {
								editor.chain()
									.focus()
									.unsetLink()
									.run();
							} else {
								const url = window.prompt("URL");
								if (url)
									editor.chain()
										.focus()
										.setLink({
											href: url,
										})
										.run();
							}
						},
						title: "Link",
						active: "link",
					},
					{
						icon: Quote,
						action: () =>
							editor
								?.chain()
								.focus()
								.toggleBlockquote()
								.run(),
						title: "Quote",
						active: "blockquote",
					},
				]
			: [
					{
						icon: Heading2,
						action: () =>
							editor
								?.chain()
								.focus()
								.toggleHeading({ level: 2 })
								.run(),
						title: "Heading",
						active: "heading",
					},
					{
						icon: Bold,
						action: () =>
							editor?.chain().focus().toggleBold().run(),
						title: "Bold",
						active: "bold",
					},
					{
						icon: Italic,
						action: () =>
							editor
								?.chain()
								.focus()
								.toggleItalic()
								.run(),
						title: "Italic",
						active: "italic",
					},
					{
						icon: Code,
						action: () =>
							editor?.chain().focus().toggleCode().run(),
						title: "Inline code",
						active: "code",
					},
					{
						icon: FileCode,
						action: () =>
							editor
								?.chain()
								.focus()
								.toggleCodeBlock()
								.run(),
						title: "Code block",
						active: "codeBlock",
					},
					{
						icon: Link,
						action: () => {
							if (!editor) return;
							if (editor.isActive("link")) {
								editor.chain()
									.focus()
									.unsetLink()
									.run();
							} else {
								const url = window.prompt("URL");
								if (url)
									editor.chain()
										.focus()
										.setLink({
											href: url,
										})
										.run();
							}
						},
						title: "Link",
						active: "link",
					},
					{
						icon: Quote,
						action: () =>
							editor
								?.chain()
								.focus()
								.toggleBlockquote()
								.run(),
						title: "Quote",
						active: "blockquote",
					},
					{
						icon: List,
						action: () =>
							editor
								?.chain()
								.focus()
								.toggleBulletList()
								.run(),
						title: "Bullet list",
						active: "bulletList",
					},
					{
						icon: ListOrdered,
						action: () =>
							editor
								?.chain()
								.focus()
								.toggleOrderedList()
								.run(),
						title: "Numbered list",
						active: "orderedList",
					},
				];

		const iconSize = compact ? "w-3 h-3" : "w-3.5 h-3.5";
		const lineHeight = compact ? 20 : 22;
		const minHeight = rows * lineHeight;

		return (
			<div
				className={cn(
					"border border-border rounded-md overflow-hidden",
					"focus-within:border-foreground/20 focus-within:ring-1 focus-within:ring-ring/50",
					"transition-colors",
					className,
				)}
			>
				{/* Toolbar */}
				<div
					className={cn(
						"flex items-center gap-0.5 border-b border-border bg-muted/30 dark:bg-white/[0.02]",
						compact ? "px-1.5 py-1" : "px-2 py-1.5",
					)}
				>
					{toolbarActions.map(
						({ icon: Icon, action, title: t, active }) => (
							<button
								key={t}
								onClick={action}
								className={cn(
									"transition-colors cursor-pointer rounded",
									compact ? "p-0.5" : "p-1",
									editor?.isActive(active)
										? "text-foreground bg-muted/80 dark:bg-white/[0.06]"
										: "text-muted-foreground hover:text-foreground",
								)}
								title={t}
								type="button"
							>
								<Icon className={iconSize} />
							</button>
						),
					)}
				</div>

				{/* Rich text editor */}
				<div
					style={{ minHeight, maxHeight: 400 }}
					className="resize-y overflow-auto"
				>
					<EditorContent editor={editor} />
				</div>
			</div>
		);
	},
);
