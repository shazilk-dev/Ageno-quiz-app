"use client";

import type { User } from "firebase/auth";
import { useState, type FormEvent } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { updateUserEmail } from "@/lib/actions/auth.actions";
import type { ProfileAction } from "./use-profile-action";

interface SectionProps {
  user: User;
  action: ProfileAction;
}

export default function EmailSection({ user, action }: SectionProps) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<{ field: "email" | "password"; text: string } | null>(null);
  const { busy, run } = action;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!newEmail.includes("@")) {
      setProblem({ field: "email", text: "Enter a valid email address." });
      return;
    }
    if (!password) {
      setProblem({ field: "password", text: "Enter your current password to confirm this change." });
      return;
    }
    setProblem(null);
    void run(() => updateUserEmail(user, newEmail, password), {
      success: "Email updated. Check your inbox to verify the new address.",
      failure: "We couldn't change your email. Check your password and try again.",
      onSuccess: () => {
        setNewEmail("");
        setPassword("");
      },
    });
  };

  return (
    <form onSubmit={submit} className="max-w-lg space-y-6" noValidate>
      <Alert variant="info">
        You&apos;ll need to verify the new address before the change takes
        effect.
      </Alert>

      <Input label="Current email" type="email" value={user.email ?? ""} disabled readOnly />

      <Input
        label="New email address"
        type="email"
        value={newEmail}
        onChange={(event) => setNewEmail(event.target.value)}
        autoComplete="email"
        placeholder="you@example.com"
        error={problem?.field === "email" ? problem.text : undefined}
        required
      />

      <Input
        label="Current password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        hint="To confirm it's you."
        error={problem?.field === "password" ? problem.text : undefined}
        required
      />

      <Button type="submit" loading={busy}>
        Update email
      </Button>
    </form>
  );
}
