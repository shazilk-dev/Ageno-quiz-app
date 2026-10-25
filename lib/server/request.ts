import { NextResponse } from "next/server";
import { auth } from "@/firebase/admin";

/** `userId` stored for people who aren't signed in (same value the old browser-side submit used). */
export const GUEST_ID = "anonymous";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/**
 * Who is calling. No `Authorization` header means a guest; a header that doesn't verify is a 401 (so
 * an expired sign-in is never quietly treated as a guest, which would file the attempt under no one).
 */
export async function getRequestUserId(request: Request): Promise<string> {
  const header = request.headers.get("authorization");
  if (!header) return GUEST_ID;

  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token) {
    throw new ApiError(401, "invalid_token", "Sign in again and retry.");
  }
  try {
    return (await auth.verifyIdToken(token)).uid;
  } catch {
    throw new ApiError(401, "invalid_token", "Your sign-in has expired. Sign in again and retry.");
  }
}

export async function readJsonBody(
  request: Request
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // Falls through to the error below.
  }
  throw new ApiError(400, "invalid_body", "The request body must be a JSON object.");
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  console.error("Unexpected API error:", error);
  return json(
    { error: "server_error", message: "Something went wrong on our side. Try again." },
    500
  );
}
