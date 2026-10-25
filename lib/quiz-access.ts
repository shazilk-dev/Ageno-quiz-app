/**
 * Remembers, for this browser session only, that a visitor entered the right access code for a quiz,
 * so the lobby doesn't ask twice. This is a convenience, not security: real verification moves to the
 * server in P5.4.
 */
const storageKey = (quizId: string) => `ageno:quiz:verified:${quizId}`;

export function isCodeVerified(quizId: string): boolean {
  try {
    return sessionStorage.getItem(storageKey(quizId)) === "1";
  } catch {
    return false;
  }
}

export function markCodeVerified(quizId: string): void {
  try {
    sessionStorage.setItem(storageKey(quizId), "1");
  } catch {
    // Storage can be unavailable (private windows); the lobby just asks again.
  }
}

/** Codes are compared without regard to case or surrounding spaces. */
export function codeMatches(typed: string, actual: string): boolean {
  return typed.trim().toLowerCase() === actual.trim().toLowerCase();
}
