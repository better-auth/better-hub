const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
	update(text: string): void;
	stop(finalText?: string): void;
}

export function spinner(text: string): Spinner {
	let i = 0;
	let current = text;
	const stream = process.stderr;

	const write = () => {
		stream.write(`\r\x1B[K  \x1B[2m${FRAMES[i]}\x1B[22m ${current}`);
		i = (i + 1) % FRAMES.length;
	};

	write();
	const timer = setInterval(write, 80);

	return {
		update(t: string) {
			current = t;
		},
		stop(finalText?: string) {
			clearInterval(timer);
			stream.write(`\r\x1B[K`);
			if (finalText) {
				stream.write(`${finalText}\n`);
			}
		},
	};
}
