// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { passwordStrength } from "@/lib/password-strength";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => nav.params,
}));

const auth = vi.hoisted(() => ({
  state: { user: null as unknown, loading: false },
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
  signUp: vi.fn(),
}));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ ...auth.state, login: auth.login, loginWithGoogle: auth.loginWithGoogle, signUp: auth.signUp }),
}));

const actions = vi.hoisted(() => ({ signOut: vi.fn(), resetPassword: vi.fn(), sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/actions/auth.actions", () => actions);

import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import SignInPage from "@/app/(auth)/sign-in/page";
import SignUpPage from "@/app/(auth)/sign-up/page";
import VerifyEmailPage from "@/app/(auth)/verify-email/page";

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.params = new URLSearchParams();
  auth.state = { user: null, loading: false };
  [auth.login, auth.loginWithGoogle, auth.signUp, ...Object.values(actions)].forEach((fn) => fn.mockReset());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("passwordStrength", () => {
  it("rates length and variety", () => {
    expect(passwordStrength("")).toBe("");
    expect(passwordStrength("abc")).toBe("weak");
    expect(passwordStrength("abcdefghijkl")).toBe("weak"); // long but one kind of character
    expect(passwordStrength("abcDEF12")).toBe("medium");
    expect(passwordStrength("abcDEF1234xyz")).toBe("strong");
    expect(passwordStrength("abcdefghij12")).toBe("medium"); // long, two kinds
  });
});

describe("Sign in", () => {
  it("shows the form, not a fake 'checking' spinner, once auth has resolved", () => {
    render(<SignInPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
  });

  it("shows no form while auth is resolving, and sends a signed-in person on", () => {
    auth.state = { user: null, loading: true };
    const view = render(<SignInPage />);
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    view.unmount();

    auth.state = { user: { uid: "u" }, loading: false };
    nav.params = new URLSearchParams("redirectTo=/my-quizzes");
    render(<SignInPage />);
    expect(nav.replace).toHaveBeenCalledWith("/my-quizzes");
  });

  it("won't follow a redirectTo that leaves the site", () => {
    auth.state = { user: { uid: "u" }, loading: false };
    nav.params = new URLSearchParams("redirectTo=//evil.example");
    render(<SignInPage />);
    expect(nav.replace).toHaveBeenCalledWith("/");
  });

  it("asks for both fields, then signs in with them", async () => {
    auth.login.mockResolvedValue({ success: true });
    render(<SignInPage />);

    click("Sign in");
    expect((await screen.findByText("Enter both your email and your password.")).closest("[role=alert]")).toBeTruthy();
    expect(auth.login).not.toHaveBeenCalled();

    type("Email", "ada@example.com");
    type("Password", "secret12");
    click("Sign in");
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith("ada@example.com", "secret12"));
  });

  it("turns Firebase codes into plain sentences", async () => {
    auth.login.mockResolvedValue({ success: false, error: "Firebase: Error (auth/invalid-credential)." });
    render(<SignInPage />);
    type("Email", "ada@example.com");
    type("Password", "nope");
    click("Sign in");

    expect(await screen.findByText("That email and password don't match. Try again.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/auth\/|Firebase/);
  });

  it("explains a closed Google popup, and links Forgot password with the typed email", async () => {
    auth.loginWithGoogle.mockResolvedValue({ success: false, error: "auth/popup-closed-by-user" });
    render(<SignInPage />);
    type("Email", "ada@example.com");
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe(
      "/reset-password?email=ada%40example.com"
    );

    click("Continue with Google");
    expect(await screen.findByText(/closed before it finished/)).toBeTruthy();
  });

  it("shows the message from a verification or password-reset redirect", () => {
    nav.params = new URLSearchParams("success=password_reset");
    render(<SignInPage />);
    expect(screen.getByText(/Your password was reset/)).toBeTruthy();
  });

  it("says the account is ready after a sign-up", () => {
    nav.params = new URLSearchParams("success=account_created");
    render(<SignInPage />);
    expect(screen.getByText(/Your account is ready/)).toBeTruthy();
  });
});

describe("Sign up", () => {
  it("checks each field and says which one", () => {
    render(<SignUpPage />);
    click("Create account");
    expect(screen.getByText("Enter your name.")).toBeTruthy();

    type("Full name", "Ada");
    click("Create account");
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();

    type("Email", "ada@example.com");
    type("Password", "abc");
    click("Create account");
    expect(screen.getByText("Use at least 6 characters.")).toBeTruthy();

    type("Password", "abcDEF12");
    type("Confirm password", "different");
    click("Create account");
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("shows the strength in words as you type", () => {
    render(<SignUpPage />);
    type("Password", "abcDEF12");
    expect(screen.getByText("Password strength: medium")).toBeTruthy();
  });

  it("creates the account, signs out, and goes straight to sign in", async () => {
    auth.signUp.mockResolvedValue({ success: true });
    actions.signOut.mockResolvedValue(true);
    render(<SignUpPage />);
    type("Full name", "Ada Lovelace");
    type("Email", "ada@example.com");
    type("Password", "abcDEF12");
    type("Confirm password", "abcDEF12");
    click("Create account");

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/sign-in?success=account_created"));
    expect(auth.signUp).toHaveBeenCalledWith("ada@example.com", "abcDEF12", "Ada Lovelace");
    expect(actions.signOut).toHaveBeenCalled();
  });

  it("says plainly when the email is already registered", async () => {
    auth.signUp.mockResolvedValue({ success: false, error: "auth/email-already-in-use" });
    render(<SignUpPage />);
    type("Full name", "Ada");
    type("Email", "ada@example.com");
    type("Password", "abcDEF12");
    type("Confirm password", "abcDEF12");
    click("Create account");

    expect(await screen.findByText("That email is already registered. Sign in instead.")).toBeTruthy();
  });
});

describe("Reset password", () => {
  it("starts with the email from the sign-in page and confirms without confirming the account exists", async () => {
    nav.params = new URLSearchParams("email=ada@example.com");
    actions.resetPassword.mockResolvedValue(true);
    render(<ResetPasswordPage />);

    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe("ada@example.com");
    click("Send reset link");
    expect(await screen.findByText(/If that address has an account/)).toBeTruthy();
    expect(actions.resetPassword).toHaveBeenCalledWith("ada@example.com");
  });

  it("asks for an email before sending", () => {
    render(<ResetPasswordPage />);
    click("Send reset link");
    expect(screen.getByText("Enter your email address.")).toBeTruthy();
    expect(actions.resetPassword).not.toHaveBeenCalled();
  });
});

describe("Verify email", () => {
  it("sends the person to sign in when nobody is signed in", () => {
    render(<VerifyEmailPage />);
    expect(nav.push).toHaveBeenCalledWith("/sign-in");
  });

  it("offers to resend, then makes them wait", async () => {
    auth.state = { user: { email: "ada@example.com", emailVerified: false }, loading: false };
    actions.sendVerificationEmail.mockResolvedValue(true);
    render(<VerifyEmailPage />);

    click("Send the email again");
    expect(await screen.findByText(/Verification email sent/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send again in 60s/ }).hasAttribute("disabled")).toBe(true);
  });

  it("says so when the email is already verified", () => {
    auth.state = { user: { email: "ada@example.com", emailVerified: true }, loading: false };
    render(<VerifyEmailPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Already verified" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find a quiz" }).getAttribute("href")).toBe("/join");
  });
});
