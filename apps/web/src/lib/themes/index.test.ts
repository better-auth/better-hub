import { describe, expect, it } from "vitest";
import { getTheme, listThemes } from "./index";

describe("theme registry", () => {
	it("registers the Helium theme with both variants", () => {
		const theme = getTheme("helium");

		expect(theme).toBeDefined();
		expect(theme?.name).toBe("Helium");
		expect(theme?.dark.accentPreview).toBe("#e87aad");
		expect(theme?.dark.colors["--background"]).toBe("#1a1418");
		expect(theme?.dark.syntax?.tokenColors.length).toBeGreaterThan(0);
		expect(theme?.light.colors["--background"]).toBe("#f5eef2");
	});

	it("keeps Helium visible in the public theme list", () => {
		expect(listThemes().some((theme) => theme.id === "helium")).toBe(true);
	});
});
