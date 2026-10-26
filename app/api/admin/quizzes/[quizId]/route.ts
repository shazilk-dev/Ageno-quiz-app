import { requireAdmin } from "@/lib/server/admin-access";
import {
  getAdminQuiz,
  parseQuizInput,
  trashQuiz,
  updateQuiz,
} from "@/lib/server/admin-quizzes";
import { invalidateQuiz } from "@/lib/server/cache";
import { errorResponse, json, readJsonBody } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ quizId: string }> };

/** One quiz for the editor, with every answer. Admin only. */
export async function GET(request: Request, { params }: Context) {
  try {
    await requireAdmin(request);
    return json(await getAdminQuiz((await params).quizId));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Saves the quiz and its questions together. The body carries the `version` the editor opened. Admin only. */
export async function PUT(request: Request, { params }: Context) {
  try {
    await requireAdmin(request);
    const { quizId } = await params;
    const body = await readJsonBody(request);
    const saved = await updateQuiz(quizId, parseQuizInput(body), body.version);
    // Players see the change on their next request (the public list, the lobby, new attempts).
    invalidateQuiz(quizId);
    return json(saved);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Moves the quiz to the trash. Nothing is deleted: players stop seeing it, and it can be restored (or
 * deleted for good from the trash). Admin only.
 */
export async function DELETE(request: Request, { params }: Context) {
  try {
    const uid = await requireAdmin(request);
    const { quizId } = await params;
    const trashed = await trashQuiz(quizId, uid);
    invalidateQuiz(quizId);
    return json(trashed);
  } catch (error) {
    return errorResponse(error);
  }
}
