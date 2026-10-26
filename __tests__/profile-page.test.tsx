// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  updateUserProfile: vi.fn(),
  updateUserEmail: vi.fn(),
  updateUserPassword: vi.fn(),
  sendVerificationEmail: vi.fn(),
  startPhoneMfaEnrollment: vi.fn(),
  completePhoneMfaEnrollment: vi.fn(),
  getMfaStatus: vi.fn(),
  generateTotpSecret: vi.fn(),
  completeTotpMfaEnrollment: vi.fn(),
  unenrollMfaFactor: vi.fn(),
}));
vi.mock("@/lib/actions/auth.actions", () => actions);
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => null }));

// A stable object, like the real context.
const auth = {
  user: { uid: "u1", displayName: "Ada", email: "ada@example.com", emailVerified: false },
  loading: false,
};
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => auth }));

import ProfilePage from "@/app/(user)/profile/page";

const goTo = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
  actions.getMfaStatus.mockReturnValue({ enrolled: false, availableFactors: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("Profile page", () => {
  it("saves the display name and says so", async () => {
    actions.updateUserProfile.mockResolvedValue(true);
    render(<ProfilePage />);

    type("Display name", "Ada L");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect((await screen.findByText("Profile updated.")).closest("[role=status]")).toBeTruthy();
    expect(actions.updateUserProfile).toHaveBeenCalledWith(auth.user, { displayName: "Ada L" });
  });

  it("shows the action's own error message in an alert", async () => {
    actions.updateUserProfile.mockResolvedValue({ code: "x", message: "Name is too long." });
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect((await screen.findByText("Name is too long.")).closest("[role=alert]")).toBeTruthy();
  });

  it("checks the password form before asking the server, field by field", async () => {
    render(<ProfilePage />);
    goTo("Password");

    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("Enter your current password.")).toBeTruthy();

    type("Current password", "old-password");
    type("New password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();

    type("New password", "long-enough-1");
    type("Confirm new password", "different-1");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
    expect(actions.updateUserPassword).not.toHaveBeenCalled();
  });

  it("changes the password, then clears the form", async () => {
    actions.updateUserPassword.mockResolvedValue(true);
    render(<ProfilePage />);
    goTo("Password");

    type("Current password", "old-password");
    type("New password", "long-enough-1");
    type("Confirm new password", "long-enough-1");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Password updated.")).toBeTruthy();
    expect(actions.updateUserPassword).toHaveBeenCalledWith(auth.user, "old-password", "long-enough-1");
    expect((screen.getByLabelText(/^Current password/) as HTMLInputElement).value).toBe("");
  });

  it("drops a notice when you move to another section", async () => {
    actions.updateUserProfile.mockResolvedValue(true);
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Profile updated.");

    goTo("Email");
    expect(screen.queryByText("Profile updated.")).toBeNull();
  });

  it("lists second factors, removes one, and has no dead buttons", async () => {
    const factor = { uid: "f1", factorId: "phone", displayName: "Phone (+1 555)" };
    actions.getMfaStatus.mockReturnValueOnce({ enrolled: true, availableFactors: [factor] });
    actions.getMfaStatus.mockReturnValue({ enrolled: false, availableFactors: [] });
    actions.unenrollMfaFactor.mockResolvedValue(true);
    render(<ProfilePage />);
    goTo("Security");

    expect(screen.getByText("Phone (+1 555)")).toBeTruthy();
    expect(screen.queryByText(/Delete account|data export|coming soon/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Second factor removed.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Phone (+1 555)")).toBeNull());
    expect(actions.unenrollMfaFactor).toHaveBeenCalledWith(auth.user, "f1");
  });
});
