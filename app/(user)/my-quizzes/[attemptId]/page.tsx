import type { Metadata } from "next";
import { getAttemptResult } from "@/lib/server/attempts";
import { getSessionUser } from "@/lib/server/session";
import AttemptReview, { type ReviewState } from "./AttemptReview";

export const metadata: Metadata = { title: "Your results" };

type PageProps = { params: Promise<{ attemptId: string }> };

/** What the server can say about this attempt for this person, or `null` to let the browser ask. */
async function loadReview(attemptId: string): Promise<ReviewState | null> {
  const session = await getSessionUser();
  if (!session) return null;
  try {
    return { kind: "ready", data: await getAttemptResult(attemptId, session.uid) };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "attempt_not_found" || code === "invalid_id") return { kind: "missing" };
    if (code === "attempt_not_finished") return { kind: "unfinished" };
    console.error("Could not load the attempt result:", error);
    return null;
  }
}

export default async function AttemptReviewPage({ params }: PageProps) {
  return <AttemptReview initial={await loadReview((await params).attemptId)} />;
}
