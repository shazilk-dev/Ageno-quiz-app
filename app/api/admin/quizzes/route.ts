import { requireAdmin } from "@/lib/server/admin-access";
import { createQuiz, listAdminQuizzes, parseQuizInput } from "@/lib/server/admin-quizzes";
import { errorResponse, json, readJsonBody } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every quiz with its access code and counts. Admin only. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return json({ quizzes: await listAdminQuizzes() });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Creates a quiz and its questions in one write. Admin only. */
export async function POST(request: Request) {
  try {
    const uid = await requireAdmin(request);
    const input = parseQuizInput(await readJsonBody(request));
    return json(await createQuiz(input, uid), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
