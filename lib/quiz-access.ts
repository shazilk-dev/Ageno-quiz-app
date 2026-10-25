/**
 * Remembers, for this browser session only, the access code someone entered for a quiz, so the lobby
 * doesn't ask twice. It is only a convenience: the server checks the code every time an attempt starts.
 */
const storageKey = (quizId: string) => `ageno:quiz:code:${quizId}`;

export function getRememberedCode(quizId: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(quizId)) || null;
  } catch {
    return null;
  }
}

export function rememberCode(quizId: string, code: string): void {
  try {
    sessionStorage.setItem(storageKey(quizId), code);
  } catch {
    // Storage can be unavailable (private windows); the lobby just asks again.
  }
}

export function forgetCode(quizId: string): void {
  try {
    sessionStorage.removeItem(storageKey(quizId));
  } catch {
    // Nothing to forget if storage is unavailable.
  }
}
