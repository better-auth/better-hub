import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
	schema: "prisma/schema",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url:
			process.env.DATABASE_URL ??
			"postgresql://placeholder:placeholder@localhost:5432/placeholder",
	},
});
