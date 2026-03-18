#!/usr/bin/env node
import { Command } from "commander";
import { authCommand } from "./commands/auth.js";
import { cdCommand } from "./commands/cd.js";
import { cloneCommand } from "./commands/clone.js";
import { commitCommand } from "./commands/commit.js";
import { createRepoCommand } from "./commands/create-repo.js";
import { deleteRepoCommand } from "./commands/delete.js";
import { listRepoCommand } from "./commands/list-repo.js";
import { configCommand } from "./commands/config.js";
import { statusCommand } from "./commands/status.js";

const program = new Command()
	.name("better-hub")
	.description("CLI for Better Hub — manage repos, auth, and more from your terminal")
	.version("0.1.0");

program.addCommand(authCommand);
program.addCommand(cdCommand);
program.addCommand(cloneCommand);
program.addCommand(configCommand);
program.addCommand(createRepoCommand);
program.addCommand(commitCommand);
program.addCommand(deleteRepoCommand);
program.addCommand(listRepoCommand);
program.addCommand(statusCommand);

program.parse();
