"use client";

import { useCallback, useState } from "react";
import type { AuthError } from "@/lib/actions/auth.actions";

export interface Notice {
  type: "success" | "error";
  text: string;
}

const isAuthError = (result: unknown): result is AuthError =>
  typeof result === "object" &&
  result !== null &&
  "code" in result &&
  "message" in result;

export interface RunOptions<T> {
  /** Shown when the task works. */
  success?: string;
  /** Shown when it fails and the error has no message of its own. */
  failure: string;
  onSuccess?: (result: T) => void;
}

export interface ProfileAction {
  notice: Notice | null;
  busy: boolean;
  /** Runs one account action: keeps `busy` up to date and turns the outcome into a notice. */
  run: <T>(task: () => Promise<T | AuthError>, options: RunOptions<T>) => Promise<void>;
  setNotice: (notice: Notice | null) => void;
}

/**
 * The part every profile form shares: one request at a time, and a plain message for how it went. The
 * auth actions return `true` (or their result) on success and an `AuthError` otherwise; they don't throw.
 */
export function useProfileAction(): ProfileAction {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(task: () => Promise<T | AuthError>, options: RunOptions<T>) => {
      setBusy(true);
      setNotice(null);
      try {
        const result = await task();
        if (result === false || isAuthError(result)) {
          setNotice({
            type: "error",
            text: isAuthError(result) && result.message ? result.message : options.failure,
          });
          return;
        }
        if (options.success) setNotice({ type: "success", text: options.success });
        options.onSuccess?.(result as T);
      } catch (error) {
        console.error("Profile action error:", error);
        setNotice({
          type: "error",
          text: "Something went wrong. Please try again in a moment.",
        });
      } finally {
        setBusy(false);
      }
    },
    []
  );

  return { notice, busy, run, setNotice };
}
