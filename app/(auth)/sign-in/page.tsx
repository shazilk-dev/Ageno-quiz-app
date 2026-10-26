"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import AuthFrame from "@/components/auth/AuthFrame";
import GoogleButton, { OrDivider } from "@/components/auth/GoogleButton";
import { Alert, Button, Input, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { safeRedirectPath } from "@/lib/navigation";

const SUCCESS_MESSAGES: Record<string, string> = {
  verification: "Email verified. You can sign in now.",
  password_reset: "Your password was reset. Sign in with the new one.",
};

/** What to tell the person for a failed email sign-in. Raw Firebase codes never reach the screen. */
function signInMessage(error: string | undefined): string {
  if (!error) return "We couldn't sign you in. Check your details and try again.";
  if (/user-not-found|wrong-password|invalid-credential/.test(error)) {
    return "That email and password don't match. Try again.";
  }
  if (error.includes("user-disabled")) return "This account has been disabled. Contact support.";
  if (error.includes("too-many-requests")) {
    return "Too many attempts. Wait a little, or reset your password.";
  }
  if (error.includes("network-request-failed")) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  return "We couldn't sign you in. Check your details and try again.";
}

function googleMessage(error: string | undefined): string {
  if (error?.includes("popup-closed-by-user")) return "Google sign-in was closed before it finished. Try again.";
  if (error?.includes("account-exists-with-different-credential")) {
    return "An account with this email already exists and uses a different way to sign in.";
  }
  return "We couldn't sign you in with Google. Try again.";
}

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithGoogle, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"password" | "google" | null>(null);

  const notice = SUCCESS_MESSAGES[searchParams.get("success") ?? ""];
  const redirectTo = searchParams.get("redirectTo");

  // Already signed in (or just did): go where they were headed.
  useEffect(() => {
    if (user) router.replace(safeRedirectPath(redirectTo));
  }, [user, router, redirectTo]);

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      setError("Enter both your email and your password.");
      return;
    }
    setBusy("password");
    setError("");
    try {
      const result = await login(email, password);
      // On success the effect above takes over once the user arrives.
      if (!result.success) setError(signInMessage(result.error));
    } catch (failure) {
      console.error("Sign in error:", failure);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = async () => {
    setBusy("google");
    setError("");
    try {
      const result = await loginWithGoogle();
      if (!result.success) setError(googleMessage(result.error));
    } catch (failure) {
      console.error("Google sign in error:", failure);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  // Waiting to learn who is signed in, or already redirecting: no form flashes by.
  if (loading || user) return <SignInSkeleton />;

  return (
    <AuthFrame
      eyebrow="// SIGN IN"
      title="Welcome back"
      description="Sign in to your Agenoverse account."
      footer={
        <>
          New here?{" "}
          <Link
            href={redirectTo ? `/sign-up?redirectTo=${encodeURIComponent(redirectTo)}` : "/sign-up"}
            className="text-link underline underline-offset-4 hover:no-underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {notice && !error && (
        <Alert variant="success" className="mb-5">
          {notice}
        </Alert>
      )}
      {error && (
        <Alert variant="error" className="mb-5">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSignIn} className="space-y-5" noValidate>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          hint={
            <Link
              href={`/reset-password?email=${encodeURIComponent(email)}`}
              className="text-link underline underline-offset-4 hover:no-underline"
            >
              Forgot password?
            </Link>
          }
        />
        <Button type="submit" className="w-full" loading={busy === "password"} disabled={busy !== null}>
          Sign in
        </Button>
      </form>

      <OrDivider />
      <GoogleButton onClick={() => void handleGoogle()} loading={busy === "google"} disabled={busy !== null} />
    </AuthFrame>
  );
}

function SignInSkeleton() {
  return (
    <div data-theme="dark" className="flex-1 bg-bg" aria-busy="true" aria-label="Checking who is signed in">
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInContent />
    </Suspense>
  );
}
