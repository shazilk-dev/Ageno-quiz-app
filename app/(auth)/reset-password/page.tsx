"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import AuthFrame from "@/components/auth/AuthFrame";
import { Alert, Button, Input, Skeleton } from "@/components/ui";
import { resetPassword } from "@/lib/actions/auth-core";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!email.trim()) {
      setFieldError("Enter your email address.");
      return;
    }
    setFieldError("");

    setBusy(true);
    try {
      const result = await resetPassword(email.trim());
      if (result === true) {
        setMessage({
          type: "success",
          text: "If that address has an account, a reset link is on its way. Check your inbox and spam folder.",
        });
        setEmail("");
      } else {
        setMessage({
          type: "error",
          text: (typeof result === "object" && result.message) || "We couldn't send the email. Check the address and try again.",
        });
      }
    } catch (failure) {
      console.error("Password reset error:", failure);
      setMessage({ type: "error", text: "Something went wrong. Please try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      eyebrow="// RESET PASSWORD"
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new one."
      footer={
        <Link href="/sign-in" className="text-link underline underline-offset-4 hover:no-underline">
          Back to sign in
        </Link>
      }
    >
      {message && (
        <Alert variant={message.type} className="mb-5">
          {message.text}
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          error={fieldError || undefined}
          required
        />
        <Button type="submit" className="w-full" loading={busy}>
          Send reset link
        </Button>
      </form>
    </AuthFrame>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div data-theme="dark" className="flex-1 bg-bg" aria-busy="true">
          <div className="mx-auto w-full max-w-md px-4 py-16">
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
