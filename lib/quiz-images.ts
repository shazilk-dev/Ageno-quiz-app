// What an uploaded question image may be. Pure, so the browser can refuse a file before sending it and the
// server can check what actually arrived (it trusts the bytes, never the declared type or the file name).
// SVG is not accepted: it can carry script.

export const IMAGE_LIMIT_BYTES = 2 * 1024 * 1024;

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export const IMAGE_EXTENSIONS: Record<ImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, i) => bytes[offset + i] === value);

/** The image type the bytes really are, or null when they are not a PNG, JPEG, WebP or GIF. */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return "image/gif";
  }
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

/** The browser's quick look at a chosen file, before it is sent: null when fine, otherwise what to tell the admin. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Choose a PNG, JPEG, WebP or GIF picture.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > IMAGE_LIMIT_BYTES) {
    return `That picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. The most is ${IMAGE_LIMIT_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}
