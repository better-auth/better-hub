import Mention from "@tiptap/extension-mention";

/**
 * Custom Mention extension that:
 * - Stores avatar_url as an extra attribute
 * - Renders an inline avatar + @username in the editor
 * - Serializes to plain `@username` text in markdown
 */
export const CustomMention = Mention.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			avatar: {
				default: null,
				parseHTML: (el: HTMLElement) => el.getAttribute("data-avatar"),
				renderHTML: (attrs: Record<string, string | null>) => {
					if (!attrs.avatar) return {};
					return { "data-avatar": attrs.avatar };
				},
			},
		};
	},

	renderHTML({ node, HTMLAttributes }) {
		const avatar = node.attrs.avatar;
		const label = node.attrs.label ?? node.attrs.id;

		if (avatar) {
			return [
				"span",
				{ ...HTMLAttributes, class: "mention" },
				[
					"img",
					{
						src: avatar,
						alt: "",
						width: "14",
						height: "14",
						class: "mention-avatar",
					},
				],
				`@${label}`,
			];
		}

		return ["span", { ...HTMLAttributes, class: "mention" }, `@${label}`];
	},

	addStorage() {
		return {
			...this.parent?.(),
			markdown: {
				serialize(
					state: { write: (text: string) => void },
					node: { attrs: Record<string, string> },
				) {
					state.write(`@${node.attrs.id || node.attrs.label || ""}`);
				},
				parse: {},
			},
		};
	},
});
