import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Better Hub",
		short_name: "Better Hub",
		description: "Re-imagining code collaboration for humans and agents.",
		start_url: "/",
		display: "standalone",
		background_color: "#000000",
		theme_color: "#000000",
		icons: [
			{
				src: "/icon-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icon-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any",
			},
		],
	};
}
