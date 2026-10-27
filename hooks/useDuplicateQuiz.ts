"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useToast } from "@/components/ui";
import { adminQuizzes } from "@/lib/admin-api";
import { ApiRequestError } from "@/lib/api-client";
import { duplicateInput } from "@/lib/quiz-duplicate";

/**
 * "Duplicate" for a quiz: reads it with its answer key, saves a closed copy under a new title and access
 * code, and opens the copy in the editor so it can be renamed and checked.
 */
export function useDuplicateQuiz() {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const duplicate = useCallback(
    async (quizId: string) => {
      setBusyId(quizId);
      try {
        const created = await adminQuizzes.create(duplicateInput(await adminQuizzes.get(quizId)));
        toast({
          title: "Quiz duplicated",
          description: "The copy is closed to players until you open it. Rename it and check it over.",
          variant: "success",
        });
        router.push(`/quizzes/${created.id}/edit`);
      } catch (failure) {
        toast({
          title: "Couldn't duplicate the quiz",
          description: failure instanceof ApiRequestError ? failure.message : "Try again.",
          variant: "error",
        });
        setBusyId(null);
      }
    },
    [router, toast]
  );

  return { duplicate, busyId };
}
