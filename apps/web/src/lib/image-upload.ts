/**
 * Abstract image upload interface.
 *
 * Swap the underlying provider by changing the default export
 * (e.g. from R2 to S3, GCS, or a local filesystem adapter).
 */

export interface UploadResult {
	/** Public URL of the uploaded image */
	url: string;
	/** Storage key / path */
	key: string;
}

export interface ImageUploadProvider {
	/**
	 * Upload an image buffer and return its public URL.
	 * @param file - Raw file bytes
	 * @param filename - Original filename (used to derive content-type)
	 */
	upload(file: Buffer, filename: string): Promise<UploadResult>;

	/**
	 * Delete a previously uploaded image by key.
	 */
	delete(key: string): Promise<void>;
}

// ── Default provider (Cloudflare R2) ────────────────────────────

import { r2ImageUpload } from "./image-upload-r2";

export const imageUpload: ImageUploadProvider = r2ImageUpload;
