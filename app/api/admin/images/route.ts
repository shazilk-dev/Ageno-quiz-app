import { requireAdmin } from "@/lib/server/admin-access";
import { storeQuestionImage } from "@/lib/server/image-upload";
import { IMAGE_LIMIT_BYTES } from "@/lib/quiz-images";
import { ApiError, errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stores a question's picture. The body is the picture itself (not a form); the answer is the address to put
 * in the question's `imageUrl`. Admin only.
 */
export async function POST(request: Request) {
  try {
    const uid = await requireAdmin(request);
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > IMAGE_LIMIT_BYTES) {
      throw new ApiError(413, "image_too_large", `The picture can be at most ${IMAGE_LIMIT_BYTES / 1024 / 1024} MB.`);
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    return json(await storeQuestionImage(bytes, uid), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
