import type { DecodedIdToken } from "firebase-admin/auth";
import { NextResponse } from "next/server";
import { auth } from "@/firebase/admin";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** Firestore document ids as this app creates them (auto ids and `quiz_<timestamp>`). */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const isSafeId = (value: unknown): value is string =>
  typeof value === "string" && SAFE_ID.test(value);

export function assertSafeId(value: unknown, what: string): asserts value is string {
  if (!isSafeId(value)) {
    throw new ApiError(400, "invalid_id", `That ${what} isn't valid.`);
  }
}

/**
 * Who is calling. Everything that belongs to a person needs a signed-in user: no `Authorization` header
 * is a 401, and so is one that doesn't verify (an expired sign-in must never pass as "someone else").
 */
export async function requireUserId(request: Request): Promise<string> {
  return (await requireUser(request)).uid;
}

/** `requireUserId`, for routes that also need what the token says (email, verified). */
export async function requireUser(request: Request): Promise<DecodedIdToken> {
  const header = request.headers.get("authorization");
  if (!header) {
    throw new ApiError(401, "sign_in_required", "Sign in to continue.");
  }

  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token) {
    throw new ApiError(401, "invalid_token", "Sign in again and retry.");
  }
  try {
    return await auth.verifyIdToken(token);
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

/** Responses are private to the caller unless a route says otherwise (`cache` is for public data only). */
export function json(body: unknown, status = 200, cache = "no-store") {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": cache },
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
