// The session check answers "who is signed in?". Nobody is a normal answer (200); a bad session is a 401.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, verify: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && state.cookie ? { value: state.cookie } : undefined) }),
}));
vi.mock("@/firebase/admin", () => ({
  auth: { verifySessionCookie: (...args: unknown[]) => state.verify(...args) },
  db: {},
}));

import { GET } from "@/app/api/auth/session/check/route";

beforeEach(() => {
  state.cookie = undefined;
  state.verify.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/auth/session/check", () => {
  it("answers 200 and not authenticated when there is no session cookie, so signed-out visitors see no error", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isAuthenticated: false, reason: "no_cookie" });
    expect(state.verify).not.toHaveBeenCalled();
  });

  it("still answers 401 for a session that is not valid, and clears the cookies", async () => {
    state.cookie = "garbage";
    state.verify.mockRejectedValue(new Error("bad"));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ isAuthenticated: false, reason: "invalid_token" });
    expect(response.headers.get("set-cookie")).toContain("session=;");
  });

  it("still answers 401 for a revoked session", async () => {
    state.cookie = "revoked";
    state.verify.mockResolvedValueOnce({ uid: "u1" }).mockRejectedValueOnce(new Error("revoked"));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ reason: "token_revoked" });
  });
});
