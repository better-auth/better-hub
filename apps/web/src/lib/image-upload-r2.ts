import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { ImageUploadProvider, UploadResult } from "./image-upload";

const CONTENT_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".avif": "image/avif",
};

function getContentType(filename: string): string {
	const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
	return CONTENT_TYPES[ext] || "application/octet-stream";
}

function getClient() {
	return new S3Client({
		region: "auto",
		endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
		credentials: {
			accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
			secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
		},
	});
}

export const r2ImageUpload: ImageUploadProvider = {
	async upload(file: Buffer, filename: string): Promise<UploadResult> {
		const client = getClient();
		const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
		const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL!;

		const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
		const key = `prompt-images/${Date.now()}-${crypto.randomUUID()}${ext}`;

		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: file,
				ContentType: getContentType(filename),
			}),
		);

		return {
			url: `${publicUrl}/${key}`,
			key,
		};
	},

	async delete(key: string): Promise<void> {
		const client = getClient();
		const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;

		await client.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: key,
			}),
		);
	},
};
