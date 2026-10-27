import { randomUUID } from "node:crypto";
import { IMAGE_EXTENSIONS, IMAGE_LIMIT_BYTES, sniffImage } from "@/lib/quiz-images";
import { ApiError } from "./request";

/** The bucket images go to: `FIREBASE_STORAGE_BUCKET`, or the project's default `<project>.appspot.com`. */
const bucketName = () =>
  process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;

/**
 * Checks what arrived is a picture of an accepted kind and size, stores it under a random name and returns
 * its address. The address carries a download token, so players can load it without the file being open to
 * the world and without any Storage rule: the browser never talks to Storage, only this route does.
 * Pictures are never removed here; deleting a quiz leaves its images behind.
 */
export async function storeQuestionImage(bytes: Uint8Array, uid: string): Promise<{ url: string }> {
  if (bytes.length === 0) throw new ApiError(400, "empty_file", "That file is empty.");
  if (bytes.length > IMAGE_LIMIT_BYTES) {
    throw new ApiError(413, "image_too_large", `The picture can be at most ${IMAGE_LIMIT_BYTES / 1024 / 1024} MB.`);
  }
  const type = sniffImage(bytes);
  if (!type) {
    throw new ApiError(415, "unsupported_image", "Choose a PNG, JPEG, WebP or GIF picture.");
  }

  // Loaded here so the many routes that never touch Storage don't pay for it on a cold start.
  await import("@/firebase/admin");
  const { getStorage } = await import("firebase-admin/storage");
  const bucket = getStorage().bucket(bucketName());
  const path = `quiz-images/${randomUUID()}.${IMAGE_EXTENSIONS[type]}`;
  const token = randomUUID();

  try {
    await bucket.file(path).save(Buffer.from(bytes), {
      resumable: false,
      contentType: type,
      metadata: {
        // A random name never changes its content, so it can be kept for good.
        cacheControl: "public, max-age=31536000, immutable",
        metadata: { firebaseStorageDownloadTokens: token, uploadedBy: uid },
      },
    });
  } catch (error) {
    console.error("Could not store a question image:", error);
    const missing = (error as { code?: number }).code === 404;
    throw new ApiError(
      503,
      "image_storage_unavailable",
      missing
        ? "Image storage isn't set up for this project yet."
        : "We couldn't store the picture. Try again."
    );
  }

  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
  };
}
