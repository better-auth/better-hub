import { intro } from "@clack/prompts";
import pc from "picocolors";
export const betterHubIntro = (msg: string) => {
	console.log();
	intro(`${pc.bgCyanBright(pc.black(" Better Hub "))}${pc.dim(`  `)}${pc.gray(`${msg}`)}`);
};
