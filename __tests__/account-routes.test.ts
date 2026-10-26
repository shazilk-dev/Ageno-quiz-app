// The account routes that replaced the browser's Firestore writes: a person updates only their own profile
// (email from the token, never the body; never the role), and only known activity types are logged.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  afterTasks: [] as Array<() => unknown>,
  verifyIdToken: vi.fn(),
  docId: "",
  update: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => state.afterTasks.push(task),
}));
vi.mock("@/firebase/admin", () => ({
  auth: { verifyIdToken: state.verifyIdToken },
  db: {
    collection: () => ({
      doc: (id: string) => {
        state.docId = id;
        return { update: state.update };
      },
    }),
  },
}));
vi.mock("@/lib/server/activity", () => ({ logActivity: state.logActivity }));

import { POST as recordActivity } from "@/app/api/account/activity/route";
import { PATCH as updateProfile } from "@/app/api/account/profile/route";

const request = (method: string, body: unknown, token: string | null = "token") =>
  new Request("http://localhost/api/account", {
    method,
    headers: token ? { Authorization: `Bearer ${token}`, "user-agent": "test" } : {},
    body: JSON.stringify(body),
  });

const runAfter = async () => {
  for (const task of state.afterTasks.splice(0)) await task();
};

beforeEach(() => {
  state.afterTasks = [];
  state.docId = "";
  state.verifyIdToken.mockReset().mockResolvedValue({
    uid: "u1",
    email: "new@example.com",
    email_verified: false,
  });
  state.update.mockReset().mockResolvedValue(undefined);
  state.logActivity.mockReset().mockResolvedValue(undefined);
});

describe("PATCH /api/account/profile", () => {
  it("needs a signed-in caller", async () => {
    const response = await updateProfile(request("PATCH", { displayName: "Ada" }, null));
    expect(response.status).toBe(401);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("updates the caller's own profile, email from the token, and logs the change afterwards", async () => {
    const response = await updateProfile(
      request("PATCH", { displayName: "  Ada  ", email: "evil@example.com", role: "admin", uid: "u2" })
    );
    expect(response.status).toBe(200);
    expect(state.docId).toBe("u1");
    const written = state.update.mock.calls[0][0];
    expect(written).toMatchObject({ displayName: "Ada", email: "new@example.com", emailVerified: false });
    expect(written).not.toHaveProperty("role");
    expect(state.logActivity).not.toHaveBeenCalled();
    await runAfter();
    expect(state.logActivity).toHaveBeenCalledWith("u1", "profile_updated", { fields: ["displayName"] }, "test");
  });

  it("with an empty body only syncs the email and logs nothing", async () => {
    expect((await updateProfile(request("PATCH", {}))).status).toBe(200);
    expect(state.update.mock.calls[0][0]).toMatchObject({ email: "new@example.com" });
    await runAfter();
    expect(state.logActivity).not.toHaveBeenCalled();
  });

  it.each([{ displayName: "" }, { displayName: "x".repeat(201) }, { photoURL: "javascript:alert(1)" }])(
    "refuses %o",
    async (body) => {
      expect((await updateProfile(request("PATCH", body))).status).toBe(400);
      expect(state.update).not.toHaveBeenCalled();
    }
  );

  it("is a 404 when there is no profile yet", async () => {
    state.update.mockRejectedValue(Object.assign(new Error("not found"), { code: 5 }));
    expect((await updateProfile(request("PATCH", { displayName: "Ada" }))).status).toBe(404);
  });
});

describe("POST /api/account/activity", () => {
  it("logs a known activity for the caller, after the response", async () => {
    const response = await recordActivity(request("POST", { type: "password_changed" }));
    expect(response.status).toBe(202);
    await runAfter();
    expect(state.logActivity).toHaveBeenCalledWith("u1", "password_changed", {}, "test");
  });

  it.each(["login", "account_created", "role_changed", 42])("refuses the type %o", async (type) => {
    expect((await recordActivity(request("POST", { type }))).status).toBe(400);
    await runAfter();
    expect(state.logActivity).not.toHaveBeenCalled();
  });

  it("drops oversized details instead of storing them", async () => {
    await recordActivity(request("POST", { type: "mfa_enabled", details: { blob: "x".repeat(2000) } }));
    await runAfter();
    expect(state.logActivity).toHaveBeenCalledWith("u1", "mfa_enabled", {}, "test");
  });

  it("needs a signed-in caller", async () => {
    expect((await recordActivity(request("POST", { type: "password_changed" }, null))).status).toBe(401);
  });
});
