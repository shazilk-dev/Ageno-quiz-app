"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import AuthFrame from "@/components/auth/AuthFrame";
import GoogleButton, { OrDivider } from "@/components/auth/GoogleButton";
import { Alert, Button, Input, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { signOut } from "@/lib/actions/auth.actions";
import { safeRedirectPath } from "@/lib/navigation";
import { passwordStrength, type PasswordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";

type Field = "name" | "email" | "password" | "confirm";

const STRENGTH_STEPS: Record<Exclude<PasswordStrength, "">, number> = { weak: 1, medium: 2, strong: 3 };

function signUpMessage(error: string | undefined): string {
  if (error?.includes("email-already-in-use")) return "That email is already registered. Sign in instead.";
  if (error?.includes("invalid-email")) return "Enter a valid email address.";
  if (error?.includes("weak-password")) return "That password is too weak. Choose a stronger one.";
  if (error?.includes("network-request-failed")) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  return "We couldn't create your account. Please try again in a moment.";
}

/** Three bars and a word, so strength never depends on colour alone. */
function StrengthMeter({ strength }: { strength: PasswordStrength }) {
  if (!strength) return null;
  const steps = STRENGTH_STEPS[strength];
  return (
    <div className="mt-2 flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span key={step} className={cn("h-1.5 flex-1 rounded-full", step <= steps ? "bg-accent" : "bg-border")} />
        ))}
      </div>
      <span className="text-sm text-text-muted">Password strength: {strength}</span>
    </div>
  );
}

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const signInHref = redirectTo ? `/sign-in?redirectTo=${encodeURIComponent(safeRedirectPath(redirectTo))}` : "/sign-in";
  const { signUp, loginWithGoogle } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<{ field: Field; text: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [created, setCreated] = useState(false);

  // After sign-up they sign in once (so a fresh session is made), a few seconds later or right away.
  useEffect(() => {
    if (!created) return;
    const timer = setTimeout(() => router.push(signInHref), 4000);
    return () => clearTimeout(timer);
  }, [created, router, signInHref]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) return setProblem({ field: "name", text: "Enter your name." });
    if (!email.includes("@")) return setProblem({ field: "email", text: "Enter a valid email address." });
    if (password.length < 6) return setProblem({ field: "password", text: "Use at least 6 characters." });
    if (password !== confirm) return setProblem({ field: "confirm", text: "The passwords don't match." });
    setProblem(null);

    setBusy("form");
    try {
      const result = await signUp(email, password, name.trim());
      if (result.success) {
        // Sign out any existing session, so they sign in fresh.
        await signOut();
        setCreated(true);
      } else {
        setError(signUpMessage(result.error));
      }
    } catch (failure) {
      console.error("Sign up error:", failure);
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
      if (result.success) {
        router.push(safeRedirectPath(redirectTo));
      } else if (result.error?.includes("popup-closed-by-user")) {
        setError("Google sign-up was closed before it finished. Try again.");
      } else if (result.error?.includes("account-exists-with-different-credential")) {
        setError("An account with this email already exists and uses a different way to sign in.");
      } else {
        setError("We couldn't sign you up with Google. Try again.");
      }
    } catch (failure) {
      console.error("Google sign up error:", failure);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const errorFor = (field: Field) => (problem?.field === field ? problem.text : undefined);

  if (created) {
    return (
      <AuthFrame eyebrow="// ACCOUNT CREATED" title="You're in">
        <div role="status" className="space-y-5">
          <p className="flex items-start gap-3 text-text-body">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            Your account is ready. Sign in with your new details to start.
          </p>
          <Button asChild className="w-full">
            <Link href={signInHref}>Go to sign in</Link>
          </Button>
          <p className="text-center text-sm text-text-muted">Taking you there in a few seconds.</p>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      eyebrow="// CREATE ACCOUNT"
      title="Join Ageno Quiz"
      description="One account for every quiz you take."
      footer={
        <>
          Already have an account?{" "}
          <Link href={signInHref} className="text-link underline underline-offset-4 hover:no-underline">
            Sign in
          </Link>
        </>
      }
    >
      {error && (
        <Alert variant="error" className="mb-5">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Input
          label="Full name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          placeholder="Ada Lovelace"
          error={errorFor("name")}
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          error={errorFor("email")}
          required
        />
        <div>
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            hint="At least 6 characters."
            error={errorFor("password")}
            required
          />
          <StrengthMeter strength={passwordStrength(password)} />
        </div>
        <Input
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          error={errorFor("confirm")}
          required
        />
        <Button type="submit" className="w-full" loading={busy === "form"} disabled={busy !== null}>
          Create account
        </Button>
      </form>

      <OrDivider />
      <GoogleButton onClick={() => void handleGoogle()} loading={busy === "google"} disabled={busy !== null} />
    </AuthFrame>
  );
}

export default function SignUp() {
  return (
    <Suspense
      fallback={
        <div data-theme="dark" className="flex-1 bg-bg" aria-busy="true">
          <div className="mx-auto w-full max-w-md px-4 py-16">
            <Skeleton className="h-[34rem] w-full rounded-lg" />
          </div>
        </div>
      }
    >
      <SignUpContent />
    </Suspense>
  );
}
