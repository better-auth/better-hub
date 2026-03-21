import Image from "@/components/shared/github-image";
import Link from "next/link";

interface Participant {
	login: string;
	avatar_url: string;
}

interface IssueParticipantsProps {
	participants: Participant[];
}

export function IssueParticipants({ participants }: IssueParticipantsProps) {
	if (participants.length === 0) return null;

	return (
		<div>
			<h3 className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-2">
				Participants
				<span className="ml-1 text-muted-foreground/30">
					{participants.length}
				</span>
			</h3>
			<div className="flex flex-wrap gap-1">
				{participants.map((p) => (
					<Link
						key={p.login}
						href={`/users/${p.login}`}
						title={p.login}
					>
						<Image
							src={p.avatar_url}
							alt={p.login}
							width={24}
							height={24}
							className="rounded-full hover:ring-1 hover:ring-foreground/20 transition-all"
						/>
					</Link>
				))}
			</div>
		</div>
	);
}
