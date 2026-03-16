import open from "open";

export function openUrl(url: string): Promise<void> {
	return open(url).then(() => {});
}
