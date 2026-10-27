// Uploading a question's picture (A3.6): what the pure checks accept, and the admin route end to end with
// Firebase mocked: admin only, size and type judged from the bytes, the stored address, a missing bucket.
//   npx vitest run __tests__/image-upload.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_LIMIT_BYTES, checkImageFile, sniffImage } from "@/lib/quiz-images";

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  profileRole: "user",
  save: vi.fn(),
  bucketNames: [] as string[],
  files: [] as string[],
}));

vi.mock("@/firebase/admin", () => ({
  auth: { verifyIdToken: state.verifyIdToken },
  db: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ role: state.profileRole }) }) }) }) },
}));
vi.mock("firebase-admin/storage", () => ({
  getStorage: () => ({
    bucket: (name: string) => {
      state.bucketNames.push(name);
      return {
        name,
        file: (path: string) => {
          state.files.push(path);
          return { save: state.save };
        },
      };
    },
  }),
}));

import { POST } from "@/app/api/admin/images/route";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
const GIF = [...Buffer.from("GIF89a"), 0, 0];
const WEBP = [...Buffer.from("RIFF"), 1, 2, 3, 4, ...Buffer.from("WEBPVP8 ")];
const SVG = [...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')];

const upload = (bytes: number[] | Uint8Array, token: string | null = "token", extra: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/admin/images", {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "content-type": "image/png", ...extra },
      body: new Uint8Array(bytes),
    })
  );

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue({ uid: "admin1", role: "admin" });
  state.profileRole = "user";
  state.save.mockReset().mockResolvedValue(undefined);
  state.bucketNames = [];
  state.files = [];
  process.env.FIREBASE_PROJECT_ID = "demo-project";
  delete process.env.FIREBASE_STORAGE_BUCKET;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the picture checks", () => {
  it("tell the four accepted kinds apart by their bytes, and refuse the rest", () => {
    expect(sniffImage(Uint8Array.from(PNG))).toBe("image/png");
    expect(sniffImage(Uint8Array.from(JPEG))).toBe("image/jpeg");
    expect(sniffImage(Uint8Array.from(GIF))).toBe("image/gif");
    expect(sniffImage(Uint8Array.from(WEBP))).toBe("image/webp");
    expect(sniffImage(Uint8Array.from(SVG))).toBeNull();
    expect(sniffImage(Uint8Array.from([...Buffer.from("%PDF-1.7")]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(sniffImage(Uint8Array.from([0x89, 0x50]))).toBeNull();
  });

  it("let the browser refuse a file before sending it, in words", () => {
    expect(checkImageFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(checkImageFile({ type: "image/svg+xml", size: 1000 })).toMatch(/PNG, JPEG, WebP or GIF/);
    expect(checkImageFile({ type: "application/pdf", size: 1000 })).toMatch(/PNG, JPEG, WebP or GIF/);
    expect(checkImageFile({ type: "image/png", size: 0 })).toBe("That file is empty.");
    expect(checkImageFile({ type: "image/jpeg", size: IMAGE_LIMIT_BYTES + 1 })).toMatch(/The most is 2 MB/);
  });
});

describe("POST /api/admin/images", () => {
  it("needs an admin: signed out is 401 and a player is 403, and nothing is stored", async () => {
    expect((await upload(PNG, null)).status).toBe(401);
    state.verifyIdToken.mockResolvedValue({ uid: "player1" });
    const refused = await upload(PNG);
    expect(refused.status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("stores a picture under a random name and answers with a tokened address", async () => {
    const response = await upload(PNG);
    expect(response.status).toBe(201);
    const { url } = await response.json();
    expect(state.bucketNames).toEqual(["demo-project.appspot.com"]);
    expect(state.files).toHaveLength(1);
    expect(state.files[0]).toMatch(/^quiz-images\/[0-9a-f-]{36}\.png$/);

    const [bytes, options] = state.save.mock.calls[0];
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(options).toMatchObject({ contentType: "image/png", resumable: false });
    const token = options.metadata.metadata.firebaseStorageDownloadTokens;
    expect(options.metadata.metadata.uploadedBy).toBe("admin1");
    expect(url).toBe(
      `https://firebasestorage.googleapis.com/v0/b/demo-project.appspot.com/o/${encodeURIComponent(state.files[0])}?alt=media&token=${token}`
    );
  });

  it("goes by the bytes, not by what the request says: a script named .png is refused, a JPEG sent as PNG is stored as JPEG", async () => {
    const script = await upload(SVG);
    expect(script.status).toBe(415);
    expect((await script.json()).error).toBe("unsupported_image");
    expect(state.save).not.toHaveBeenCalled();

    expect((await upload(JPEG)).status).toBe(201);
    expect(state.files[0]).toMatch(/\.jpg$/);
    expect(state.save.mock.calls[0][1].contentType).toBe("image/jpeg");
  });

  it("refuses an empty body and one that is too big, by its declared size or its real size", async () => {
    expect((await upload([])).status).toBe(400);
    const big = await upload(PNG, "token", { "content-length": String(IMAGE_LIMIT_BYTES + 1) });
    expect(big.status).toBe(413);
    const bytes = new Uint8Array(IMAGE_LIMIT_BYTES + 1);
    bytes.set(PNG);
    expect((await upload(bytes)).status).toBe(413);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("uses the configured bucket when there is one", async () => {
    process.env.FIREBASE_STORAGE_BUCKET = "demo-project.firebasestorage.app";
    const { url } = await (await upload(GIF)).json();
    expect(url).toContain("/b/demo-project.firebasestorage.app/o/");
  });

  it("says so, not 'something went wrong', when storage isn't set up, and when the write fails", async () => {
    state.save.mockRejectedValueOnce(Object.assign(new Error("no such bucket"), { code: 404 }));
    const missing = await upload(PNG);
    expect(missing.status).toBe(503);
    expect((await missing.json()).message).toBe("Image storage isn't set up for this project yet.");

    state.save.mockRejectedValueOnce(new Error("boom"));
    const failed = await upload(WEBP);
    expect(failed.status).toBe(503);
    expect((await failed.json()).message).toBe("We couldn't store the picture. Try again.");
  });
});
