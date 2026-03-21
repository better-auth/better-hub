import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/client.ts", "src/plugin.ts", "src/adapter.ts", "src/db-schema.ts"],
	format: "esm",
	dts: true,
	clean: true,
	exports: true,
});
