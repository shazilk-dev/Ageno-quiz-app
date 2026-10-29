import { describe, expect, it, vi } from "vitest";

// `request.ts` imports the Admin SDK, which refuses to load without credentials; only the helper is under test.
vi.mock("@/firebase/admin", () => ({ auth: {}, db: {} }));

import { isMissingIndex } from "@/lib/server/request";

describe("isMissingIndex", () => {
  it("recognises the gRPC error (the emulator and tests): code 9", () => {
    expect(isMissingIndex(Object.assign(new Error("9 FAILED_PRECONDITION: The query requires an index."), { code: 9 }))).toBe(true);
  });

  it("recognises the REST error production gets: code 3 and a message saying an index is required", () => {
    const error = Object.assign(new Error("The query requires an index. You can create it here: https://console.firebase.google.com/x"), {
      code: 3,
    });
    expect(isMissingIndex(error)).toBe(true);
  });

  it("does not take other failures for a missing index", () => {
    expect(isMissingIndex(Object.assign(new Error("Invalid argument: bad cursor"), { code: 3 }))).toBe(false);
    expect(isMissingIndex(Object.assign(new Error("The query requires an index."), { code: 14 }))).toBe(false);
    expect(isMissingIndex(Object.assign(new Error("boom"), { code: "ECONNRESET" }))).toBe(false);
    expect(isMissingIndex(new Error("The query requires an index."))).toBe(false);
    expect(isMissingIndex(null)).toBe(false);
    expect(isMissingIndex(undefined)).toBe(false);
    expect(isMissingIndex("The query requires an index.")).toBe(false);
  });
});
