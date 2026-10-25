import { listPublicQuizzes } from "@/lib/server/quizzes";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";

/** The quizzes people can pick from. Public, never includes access codes, and fine to cache briefly. */
export async function GET() {
  try {
    return json(
      { quizzes: await listPublicQuizzes() },
      200,
      "public, s-maxage=30, stale-while-revalidate=120"
    );
  } catch (error) {
    return errorResponse(error);
  }
}
