import * as z from "zod/v4";

const slugSegmentSchema = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-z0-9-_]+$/);
export const slugSchema = z.templateLiteral([slugSegmentSchema, "/", slugSegmentSchema]);
